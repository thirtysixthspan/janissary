import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROJECT_TOKENS, loadProjectTokens, getProjectTokens } from './project-tokens.js';

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'project-tokens-'));
  mkdirSync(path.join(dir, '.janissary'), { recursive: true });
  return dir;
}

function write(dir: string, file: string, contents: string): void {
  writeFileSync(path.join(dir, '.janissary', file), contents);
}

describe('loadProjectTokens', () => {
  // Driven off the table rather than a hand-written list, so a row added without a matching file
  // name or variable fails here instead of silently never being read.
  it.each(PROJECT_TOKENS)('reads and trims .janissary/$file into $name', ({ name, file }) => {
    const dir = project();
    write(dir, file, `  value-for-${name}  \n`);
    expect(loadProjectTokens(dir)[name]).toBe(`value-for-${name}`);
  });

  it('omits a token whose file is missing', () => {
    const dir = project();
    expect(loadProjectTokens(dir)).toEqual({});
  });

  it('omits a token whose file holds only whitespace', () => {
    const dir = project();
    write(dir, 'github-token', '   \n');
    expect(loadProjectTokens(dir)).toEqual({});
  });

  it('reads every configured token in one pass, leaving absent ones out', () => {
    const dir = project();
    write(dir, 'github-token', 'ghp_abc123\n');
    write(dir, 'gemini-token', 'AIzaSyExample\n');
    expect(loadProjectTokens(dir)).toEqual({ github: 'ghp_abc123', gemini: 'AIzaSyExample' });
  });

  it('exposes the loaded record through getProjectTokens', () => {
    const dir = project();
    write(dir, 'claude-token', 'sk-ant-oat01-abc\n');
    loadProjectTokens(dir);
    expect(getProjectTokens()).toEqual({ claude: 'sk-ant-oat01-abc' });
  });

  // The per-module caches this replaced could not leak between projects, because each held one
  // value it overwrote every load. A shared record can, so loading must replace rather than merge.
  it('replaces the cache on a second load rather than merging into it', () => {
    const first = project();
    write(first, 'github-token', 'ghp_first\n');
    loadProjectTokens(first);

    const second = project();
    write(second, 'gemini-token', 'AIzaSySecond\n');
    expect(loadProjectTokens(second)).toEqual({ gemini: 'AIzaSySecond' });
    expect(getProjectTokens()).toEqual({ gemini: 'AIzaSySecond' });
  });
});

// The `env` column carries a list so one credential can be set under every name its consumer reads —
// the gemini row sets two. These pin what a list must not become.
describe('PROJECT_TOKENS', () => {
  // A row with no variable is a credential that gets read and then handed to nothing.
  it.each(PROJECT_TOKENS)('names at least one environment variable for $name', ({ env }) => {
    expect(env.length).toBeGreaterThan(0);
  });

  // Two rows naming one variable means whichever is written last silently wins.
  it('names each environment variable on exactly one row', () => {
    const variables = PROJECT_TOKENS.flatMap(({ env }) => [...env]);
    expect(new Set(variables).size).toBe(variables.length);
  });
});
