import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DATA_THISTLE_SOURCE_POLICY,
  upsertExternalEvents,
  type ExternalEventInput,
} from '@clydeculture/shared';
import { parseDataThistleEvents, parseDataThistleEventsForStaging } from './parse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';

function readFixture(name: string): unknown[] {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf-8')
  ) as unknown[];
}

type UpsertClient = Parameters<typeof upsertExternalEvents>[0];

function mockClient() {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  return { client: { from } as unknown as UpsertClient, from, upsert };
}

describe('Data Thistle staging import path', () => {
  it('parsed RawEvents are valid ExternalEventInput rows for upsertExternalEvents', async () => {
    const { items } = parseDataThistleEvents(readFixture('categories-tags'));
    expect(items.length).toBeGreaterThan(0);

    // Structural compatibility is part of the contract: RawEvent mirrors
    // ExternalEventInput field-for-field.
    const inputs: ExternalEventInput[] = items;

    const { client, from, upsert } = mockClient();
    await upsertExternalEvents(client, SOURCE_ID, inputs);

    expect(from).toHaveBeenCalledWith('external_events');
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = upsert.mock.calls[0] as [
      Array<Record<string, unknown>>,
      Record<string, unknown>,
    ];
    expect(options).toEqual({ onConflict: 'source_id,external_id' });
    expect(rows).toHaveLength(items.length);
    for (const row of rows) {
      expect(row['source_id']).toBe(SOURCE_ID);
      expect(String(row['external_id'])).toMatch(/^datathistle:/);
      expect(String(row['external_url'])).toMatch(/^https:/);
      expect(row['title']).toBeTruthy();
    }
  });

  it('external IDs are stable across repeated parses for idempotent upserts', () => {
    const first = parseDataThistleEvents(readFixture('multi-performance'));
    const second = parseDataThistleEvents(readFixture('multi-performance'));

    const firstIds = first.items.map((item) => item.externalId);
    const secondIds = second.items.map((item) => item.externalId);

    expect(firstIds).toEqual(secondIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  it('category and tag metadata survive into the staged row shape', async () => {
    const { items } = parseDataThistleEvents(readFixture('categories-tags'));
    const tagged = items.find((item) => (item.tagsGuess ?? []).length > 0);
    expect(tagged).toBeDefined();

    const { client, upsert } = mockClient();
    await upsertExternalEvents(client, SOURCE_ID, items);

    const [rows] = upsert.mock.calls[0] as [Array<Record<string, unknown>>];
    const taggedRow = rows.find((row) => row['external_id'] === tagged?.externalId);
    expect(taggedRow?.['tags_guess']).toEqual(tagged?.tagsGuess);
    if (tagged?.eventTypeGuess !== undefined) {
      expect(taggedRow?.['event_type_guess']).toBe(tagged.eventTypeGuess);
    }
  });

  it('disallowed fields never reach the staged row under current policy', async () => {
    const fixtures = [
      'single-performance',
      'multi-performance',
      'categories-tags',
      'missing-price',
      'missing-venue-fields',
    ];

    for (const fixture of fixtures) {
      const { items } = parseDataThistleEventsForStaging(
        readFixture(fixture),
        DATA_THISTLE_SOURCE_POLICY
      );

      const { client, upsert } = mockClient();
      await upsertExternalEvents(client, SOURCE_ID, items);

      const [rows] = upsert.mock.calls[0] as [Array<Record<string, unknown>>];
      for (const row of rows) {
        expect(row).not.toHaveProperty('description');
        expect(row).not.toHaveProperty('summary');
        expect(row).not.toHaveProperty('image_url_guess');
        const rawText = JSON.stringify(row['raw']);
        expect(rawText).not.toContain('description');
        expect(rawText).not.toContain('image');
      }
    }
  });

  it('staging-disabled policy yields no rows to import', () => {
    const { items, errors } = parseDataThistleEventsForStaging(
      readFixture('single-performance'),
      { ...DATA_THISTLE_SOURCE_POLICY, allowStagingCollection: false }
    );
    expect(items).toEqual([]);
    expect(errors.some((message) => message.includes('staging collection disabled'))).toBe(true);
  });
});
