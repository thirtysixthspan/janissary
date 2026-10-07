import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZshStartupDirectory } from './directory.js';
import { ZSHENV, ZSHRC } from './script.js';

describe('ZshStartupDirectory', () => {
  let parent: string;
  let startup: ZshStartupDirectory;

  beforeEach(() => {
    parent = mkdtempSync(path.join(tmpdir(), 'zsh-startup-test-'));
    startup = new ZshStartupDirectory(parent);
  });

  afterEach(() => {
    startup.dispose();
    rmSync(parent, { recursive: true, force: true });
  });

  it('writes both startup files into a private directory, once', () => {
    const directory = startup.path();
    expect(readFileSync(path.join(directory, '.zshenv'), 'utf8')).toBe(ZSHENV);
    expect(readFileSync(path.join(directory, '.zshrc'), 'utf8')).toBe(ZSHRC);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(startup.path()).toBe(directory);
  });

  it('starts again when something removed a file, rather than spawning a shell with no startup', () => {
    const first = startup.path();
    rmSync(path.join(first, '.zshrc'));
    const second = startup.path();
    expect(second).not.toBe(first);
    expect(existsSync(first)).toBe(false);
    expect(existsSync(path.join(second, '.zshrc'))).toBe(true);
  });

  it('removes the directory on dispose', () => {
    const directory = startup.path();
    startup.dispose();
    expect(existsSync(directory)).toBe(false);
  });
});
