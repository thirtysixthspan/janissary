import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// What the production roles chunk actually contains, answered from the sources the bundler reads.
// `npm test` builds nothing, and a build here would make the suite's runtime depend on the bundler;
// the static graph is what the bundler follows for every import below. Dynamic `import()` is not
// modelled, and for this plugin there is none inside the entry — the only one is the loader map in
// `web/src/plugins/registry.tsx`, which is outside it.
const ROOT = process.cwd();
const SERVER_API = path.join(ROOT, 'src/plugins/api.ts');
// Every static import clause, keeping the specifier and the clause it belongs to: `import type` and
// `export type` are erased before the bundler sees them and contribute nothing to a chunk, so the walk
// skips them rather than following a module that never ships.
const SPECIFIER = /(?:^|\n)\s*(?:import|export)\s+([^;\n]*?)from\s*['"]([^'"]+)['"]/g;

const SOURCES = ['.ts', '.tsx'];

function resolve(specifier: string, from: string): string | null {
  const base = specifier.startsWith('@shared/')
    ? path.join(ROOT, 'src', specifier.slice('@shared/'.length))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(from), specifier)
      : null;
  if (base === null) return null;
  // The `src/` tree is NodeNext, so a relative specifier names the emitted `.js` while the source
  // beside it is `.ts`. Both spellings have to resolve or the walk silently stops at the first file
  // that uses one.
  const source = base.endsWith('.js') ? base.slice(0, -'.js'.length) : base;
  const candidates = [
    ...SOURCES.map((extension) => `${base}${extension}`),
    ...SOURCES.map((extension) => `${source}${extension}`),
    ...SOURCES.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function chunkOf(entry: string): { modules: string[]; bare: string[] } {
  const modules: string[] = [];
  const bare: string[] = [];
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    modules.push(path.relative(ROOT, file));
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const [, clause, specifier] = match;
      if (/^type\b/.test(clause)) continue;
      const resolved = resolve(specifier, file);
      // A package or a Node built-in: recorded rather than followed, since it is what the chunk
      // would carry into the browser as-is.
      if (resolved === null) bare.push(specifier);
      else queue.push(resolved);
    }
  }
  return { modules, bare };
}

describe('the roles client chunk', () => {
  it('reaches neither the server plugin API nor a Node module', () => {
    const { modules, bare } = chunkOf(path.join(ROOT, 'web/src/plugins/roles/index.tsx'));

    expect(modules).toContain('src/plugins/roles/shared.ts');
    expect(modules).not.toContain(path.relative(ROOT, SERVER_API));
    expect(bare.filter((specifier) => specifier.startsWith('node:'))).toEqual([]);
  });
});