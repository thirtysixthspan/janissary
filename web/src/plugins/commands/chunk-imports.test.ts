import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SERVER_API = path.join(ROOT, 'src/plugins/api.ts');
const SPECIFIER = /(?:^|\n)\s*(?:import|export)\s+([^;\n]*?)from\s*['"]([^'"]+)['"]/g;
const SOURCES = ['.ts', '.tsx'];

function resolve(specifier: string, from: string): string | null {
  const base = specifier.startsWith('@shared/')
    ? path.join(ROOT, 'src', specifier.slice('@shared/'.length))
    : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null;
  if (base === null) return null;
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
      if (/^type\b/u.test(clause)) continue;
      const resolved = resolve(specifier, file);
      if (resolved === null) bare.push(specifier);
      else queue.push(resolved);
    }
  }
  return { modules, bare };
}

describe('the commands client chunk', () => {
  it('reaches only the import-free shared contract, not server modules or Node APIs', () => {
    const { modules, bare } = chunkOf(path.join(ROOT, 'web/src/plugins/commands/index.tsx'));

    expect(modules).toContain('src/plugins/commands/shared.ts');
    expect(modules).not.toContain(path.relative(ROOT, SERVER_API));
    expect(modules).not.toContain('src/plugins/commands/activate.ts');
    expect(modules).not.toContain('src/plugins/commands/payload.ts');
    expect(modules).not.toContain('src/plugins/commands/parse-command.ts');
    expect(modules.some((module) => module.includes('native-commands'))).toBe(false);
    expect(bare.filter((specifier) => specifier.startsWith('node:'))).toEqual([]);
  });
});
