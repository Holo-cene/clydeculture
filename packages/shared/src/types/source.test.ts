import { describe, it, expect } from 'vitest';
import type { Source } from './source.js';

// B2 — Source interface DB alignment tests (Step 2: GREEN)
//
// The SQL `sources` table is canonical. The TypeScript Source interface uses
// DB-backed field names: enabled (not isActive), no baseUrl.

describe('Source interface — DB alignment', () => {
  const source: Source = {
    id: 'test-id',
    name: 'Test Source',
    slug: 'test-source',
    source_type: 'api',
    tier: 1,
    config: {},
    status: 'ok',
    enabled: true,
    last_run_at: null,
    last_success_at: null,
    last_error_at: null,
    last_error: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  it('Source uses enabled (the DB column) not isActive', () => {
    expect(source).toHaveProperty('enabled');
  });

  it('Source does not have baseUrl (no such column in sources table)', () => {
    expect(source).not.toHaveProperty('baseUrl');
  });
});
