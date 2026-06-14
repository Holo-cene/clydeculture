/**
 * Architecture boundary: @clydeculture/core must contain only pure logic.
 *
 * Invariant (packages/core/CLAUDE.md):
 *   "No I/O. This package must never import Supabase, fetch, fs, or any
 *    network/disk dependency. If you need data from the DB, pass it as an argument."
 *
 * DB-backed orchestration — table access, RPC calls, or DB client interfaces —
 * must not live in @clydeculture/core. It belongs in the ingestion layer.
 *
 * This test fails while normalise/dbNormalise.ts and its re-exports remain in core.
 * It passes once DB orchestration is moved to a package that depends on core,
 * not the other way around.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_SRC = resolve(__dirname, '..');

const DB_ORCHESTRATION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'Supabase table access via .from("TABLE")',
    pattern:
      /\.from\(['"`](?:events|sources|external_events|venues|event_types|source_type_category_map)['"`]\)/,
  },
  {
    name: 'RPC call via client.rpc(',
    pattern: /\bclient\.rpc\(/,
  },
  {
    name: 'DB client interface NormaliseDbClient',
    pattern: /\bNormaliseDbClient\b/,
  },
];

function collectProductionSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectProductionSourceFiles(full));
    } else if (
      full.endsWith('.ts') &&
      !full.endsWith('.test.ts') &&
      !full.includes('.integration.')
    ) {
      files.push(full);
    }
  }
  return files;
}

describe('@clydeculture/core architecture boundary', () => {
  it('production source files must not contain DB-backed orchestration or DB client interfaces', () => {
    const sourceFiles = collectProductionSourceFiles(CORE_SRC);
    const violations: string[] = [];

    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf-8');
      const relative = file.replace(CORE_SRC + '/', '');
      for (const { name, pattern } of DB_ORCHESTRATION_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`  ${relative}: found ${name}`);
        }
      }
    }

    expect(violations, [
      'DB-backed orchestration must not live in @clydeculture/core.',
      '',
      'Violations:',
      ...violations,
      '',
      'Move DB orchestration to the ingestion layer.',
      'Suggested target: packages/ingestion',
      '  (new package depending on @clydeculture/core + @clydeculture/shared,',
      '   imported by trigger/ — no circular dependency).',
    ].join('\n')).toHaveLength(0);
  });
});
