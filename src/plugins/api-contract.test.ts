import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from './api.js';

const pluginsDir = fileURLToPath(new URL('.', import.meta.url));

function pluginSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return pluginSources(file);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [file] : [];
  });
}

function importedApiValues(source: string): string[] {
  const values: string[] = [];
  const imports = /import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/api\.js['"]/g;
  const matches = source.matchAll(imports);
  for (const match of matches) {
    const clauses = match[1]!.split(',', 32);
    for (const clause of clauses) {
      const specifier = clause.trim();
      if (!specifier || specifier.startsWith('type ')) continue;
      const name = specifier.split(/\s+as\s+/, 2)[0]!.trim();
      if (name) values.push(name);
    }
  }
  return values;
}

describe('published plugin API contract', () => {
  it('extracts the guard the connections activation imports from the API', () => {
    const source = readFileSync(path.join(pluginsDir, 'connections/activate.ts'), 'utf8');
    expect(importedApiValues(source)).toContain('isEmptyIntent');
  });

  it('exports every value bundled plugins import from the API', () => {
    const files = pluginSources(pluginsDir);
    for (const file of files) {
      const names = importedApiValues(readFileSync(file, 'utf8'));
      for (const name of names) {
        expect(Object.hasOwn(api, name), `${file} imports ${name}, which the plugin API does not export`).toBe(true);
      }
    }
  });

  it('publishes the shared intent guards as callable functions', () => {
    expect(typeof api.isEmptyIntent).toBe('function');
    expect(typeof api.isIdIntent).toBe('function');
    expect(typeof api.isRefreshIntent).toBe('function');
  });
});
