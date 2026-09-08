import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROJECT_TOKENS, loadProjectTokens, getProjectTokens } from './tokens.js';

const GITHUB_FILE = 'github-token';
const GEMINI_FILE = 'gemini-token';

function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'project-tokens-'));
  mkdirSync(path.join(dir, '.janissary'), { recursive: true });
  return dir;
}

// Every test names a home directory of its own, even the ones that never write a file into it.
// Letting the default stand would read whatever the machine running the suite keeps in
// `~/.janissary`, and a developer with real credentials there would see these tests fail.
function home(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'home-tokens-'));
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
    expect(loadProjectTokens(dir, home())[name]).toBe(`value-for-${name}`);
  });

  it('omits a token that neither the project nor the home directory has', () => {
    expect(loadProjectTokens(project(), home())).toEqual({});
  });

  it('omits a token whose file holds only whitespace', () => {
    const dir = project();
    write(dir, GITHUB_FILE, '   \n');
    expect(loadProjectTokens(dir, home())).toEqual({});
  });

  it('reads every configured token in one pass, leaving absent ones out', () => {
    const dir = project();
    write(dir, GITHUB_FILE, 'ghp_abc123\n');
    write(dir, GEMINI_FILE, 'AIzaSyExample\n');
    expect(loadProjectTokens(dir, home())).toEqual({ github: 'ghp_abc123', gemini: 'AIzaSyExample' });
  });

  it('exposes the loaded record through getProjectTokens', () => {
    const dir = project();
    write(dir, 'claude-token', 'sk-ant-oat01-abc\n');
    loadProjectTokens(dir, home());
    expect(getProjectTokens()).toEqual({ claude: 'sk-ant-oat01-abc' });
  });

  // The per-module caches this replaced could not leak between projects, because each held one
  // value it overwrote every load. A shared record can, so loading must replace rather than merge.
  it('replaces the cache on a second load rather than merging into it', () => {
    const first = project();
    write(first, GITHUB_FILE, 'ghp_first\n');
    loadProjectTokens(first, home());

    const second = project();
    write(second, GEMINI_FILE, 'AIzaSySecond\n');
    expect(loadProjectTokens(second, home())).toEqual({ gemini: 'AIzaSySecond' });
    expect(getProjectTokens()).toEqual({ gemini: 'AIzaSySecond' });
  });
});

// A credential belongs to the person more often than to the checkout, so `~/.janissary/` is where
// one copy serves every project on the machine. The project keeps the last word.
describe('loadProjectTokens with a home directory', () => {
  it.each(PROJECT_TOKENS)('reads and trims ~/.janissary/$file into $name', ({ name, file }) => {
    const dir = home();
    write(dir, file, `  home-value-for-${name}  \n`);
    expect(loadProjectTokens(project(), dir)[name]).toBe(`home-value-for-${name}`);
  });

  it('prefers the project file when both places have one', () => {
    const dir = project();
    const homeDir = home();
    write(dir, GITHUB_FILE, 'ghp_project\n');
    write(homeDir, GITHUB_FILE, 'ghp_home\n');
    expect(loadProjectTokens(dir, homeDir)).toEqual({ github: 'ghp_project' });
  });

  // An empty project file is not a way to opt a project out: the loader reads it as nothing to
  // inject, exactly as it reads a missing one, so the home credential answers instead.
  it('falls back to the home file when the project file holds only whitespace', () => {
    const dir = project();
    const homeDir = home();
    write(dir, GITHUB_FILE, '  \n');
    write(homeDir, GITHUB_FILE, 'ghp_home\n');
    expect(loadProjectTokens(dir, homeDir)).toEqual({ github: 'ghp_home' });
  });

  it('resolves each credential on its own, so one load can draw from both places', () => {
    const dir = project();
    const homeDir = home();
    write(dir, GITHUB_FILE, 'ghp_project\n');
    write(homeDir, GEMINI_FILE, 'AIzaSyHome\n');
    expect(loadProjectTokens(dir, homeDir)).toEqual({ github: 'ghp_project', gemini: 'AIzaSyHome' });
  });

  // The cache must be replaced by what the second project resolves to, and a home credential is
  // resolved the same way a project one is — not carried over from the load before it.
  it('replaces a cached home credential when the next project overrides it', () => {
    const homeDir = home();
    write(homeDir, GITHUB_FILE, 'ghp_home\n');
    loadProjectTokens(project(), homeDir);

    const second = project();
    write(second, GITHUB_FILE, 'ghp_second_project\n');
    expect(loadProjectTokens(second, homeDir)).toEqual({ github: 'ghp_second_project' });
    expect(getProjectTokens()).toEqual({ github: 'ghp_second_project' });
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
