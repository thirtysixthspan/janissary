import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initProfileDir, listProfiles, listProfileRows, resolveProfile } from './profiles.js';
import { parseProfileCommand, PROFILE_USAGE } from './profile/command.js';

describe('parseProfileCommand', () => {
  it('parses launch with a name', () => {
    expect(parseProfileCommand('profile launch writing-code')).toEqual({ action: 'launch', name: 'writing-code' });
  });

  it('parses list', () => {
    expect(parseProfileCommand('profile list')).toEqual({ action: 'list' });
  });

  it('errors on missing/unknown forms', () => {
    expect(parseProfileCommand('profile')).toEqual({ error: PROFILE_USAGE });
    expect(parseProfileCommand('profile launch')).toHaveProperty('error');
    expect(parseProfileCommand('profile bogus')).toEqual({ error: PROFILE_USAGE });
  });
});

describe('single-file profiles', () => {
  let root: string;
  let janissary: string;

  const writeProfile = (name: string, base = root) => {
    writeFileSync(path.join(base, 'profiles', `${name}.rs`), 'echo hi\n');
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-prof-'));
    janissary = mkdtempSync(path.join(tmpdir(), 'janus-built-in-prof-'));
    initProfileDir(root, janissary);
    mkdirSync(path.join(root, 'profiles'), { recursive: true });
    mkdirSync(path.join(janissary, 'profiles'), { recursive: true });
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    if (janissary) rmSync(janissary, { recursive: true, force: true });
  });

  it('lists profile files (extension stripped) sorted', () => {
    writeProfile('surfing');
    writeProfile('coding');
    expect(listProfiles()).toEqual(['coding', 'surfing']);
  });

  it('lists project profiles before built-in profiles and lets project names override', () => {
    writeProfile('coding');
    writeProfile('shared');
    writeProfile('planning', janissary);
    writeProfile('shared', janissary);
    expect(listProfiles()).toEqual(['coding', 'shared', 'planning']);
    expect(listProfileRows()).toEqual([
      { name: 'coding', source: 'project' },
      { name: 'shared', source: 'project' },
      { name: 'planning', source: 'janissary' },
    ]);
  });

  it('never lists a subdirectory of profiles/ as a row', () => {
    writeProfile('coding');
    mkdirSync(path.join(root, 'profiles', 'archive'), { recursive: true });
    mkdirSync(path.join(janissary, 'profiles', 'shipped'), { recursive: true });
    expect(listProfileRows()).toEqual([{ name: 'coding', source: 'project' }]);
  });

  it('neither lists nor resolves a name that has only a .json file', () => {
    writeFileSync(path.join(root, 'profiles', 'legacy.json'), JSON.stringify({ tabs: [] }));
    writeFileSync(path.join(janissary, 'profiles', 'shipped.json'), JSON.stringify({ tabs: [] }));
    expect(listProfileRows()).toEqual([]);
    expect(resolveProfile('legacy')).toBeUndefined();
    expect(resolveProfile('shipped')).toBeUndefined();
  });

  describe('runscript profiles', () => {
    const writeRunscript = (name: string, base = root) => {
      const file = path.join(base, 'profiles', `${name}.rs`);
      writeFileSync(file, 'echo hi\n');
      return file;
    };

    it('resolves a built-in runscript when the project has no profile of that name', () => {
      const file = writeRunscript('planning', janissary);
      expect(resolveProfile('planning')).toBe(file);
    });

    it('treats a symlink at the runscript path as the runscript', () => {
      const target = writeRunscript('elsewhere');
      const link = path.join(root, 'profiles', 'coding.rs');
      symlinkSync(target, link);
      expect(resolveProfile('coding')).toBe(link);
    });

    it('lists a runscript-only profile and a name with both files once', () => {
      writeRunscript('deploy');
      writeRunscript('coding');
      writeRunscript('planning', janissary);
      expect(listProfileRows()).toEqual([
        { name: 'coding', source: 'project' },
        { name: 'deploy', source: 'project' },
        { name: 'planning', source: 'janissary' },
      ]);
    });
  });
});
