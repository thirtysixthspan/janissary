import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initProfileDir, listProfiles, listProfileRows, profileExists, profilePath, profileReadPath,
} from './profiles.js';
import { parseProfileCommand, PROFILE_USAGE } from './profile/command.js';
import { loadProfile } from './profile/file.js';
import type { LoadedProfile, ProfileFile } from './types.js';

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

  const writeProfile = (name: string, file: ProfileFile, base = root) => {
    writeFileSync(path.join(base, 'profiles', `${name}.json`), JSON.stringify(file));
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
    writeProfile('surfing', {});
    writeProfile('coding', {});
    expect(listProfiles()).toEqual(['coding', 'surfing']);
  });

  it('lists project profiles before built-in profiles and lets project names override', () => {
    writeProfile('coding', {});
    writeProfile('shared', {});
    writeProfile('planning', {}, janissary);
    writeProfile('shared', { tabs: [{ type: 'agent', name: 'built-in', active: false }] }, janissary);
    expect(listProfiles()).toEqual(['coding', 'shared', 'planning']);
    expect(listProfileRows()).toEqual([
      { name: 'coding', source: 'project' },
      { name: 'shared', source: 'project' },
      { name: 'planning', source: 'janissary' },
    ]);
  });

  it('never lists a subdirectory of profiles/ as a row', () => {
    writeProfile('coding', {});
    mkdirSync(path.join(root, 'profiles', 'archive'), { recursive: true });
    mkdirSync(path.join(janissary, 'profiles', 'shipped'), { recursive: true });
    expect(listProfileRows()).toEqual([{ name: 'coding', source: 'project' }]);
  });

  it('resolves profilePath/profileExists to the file', () => {
    writeProfile('coding', {});
    expect(profilePath('coding')).toBe(path.join(root, 'profiles', 'coding.json'));
    expect(profileExists('coding')).toBe(true);
    expect(profileExists('missing')).toBe(false);
  });

  it('reads a built-in profile when no project profile has the same name', () => {
    writeProfile('planning', { tabs: [{ type: 'agent', name: 'planner', active: false }] }, janissary);
    expect(profileReadPath('planning')).toBe(path.join(janissary, 'profiles', 'planning.json'));
    expect(profileExists('planning')).toBe(true);
    expect((loadProfile('planning') as LoadedProfile).entries[0].name).toBe('planner');
    expect(profilePath('planning')).toBe(path.join(root, 'profiles', 'planning.json'));
  });

  it('reads the project profile when both sources use the same name', () => {
    writeProfile('shared', { tabs: [{ type: 'agent', name: 'project-agent', active: false }] });
    writeProfile('shared', { tabs: [{ type: 'agent', name: 'built-in-agent', active: false }] }, janissary);
    expect((loadProfile('shared') as LoadedProfile).entries[0].name).toBe('project-agent');
  });

  it('loads agent and harness tabs ordered by number, each entry name as its label', () => {
    writeProfile('coding', {
      tabs: [
        { type: 'agent', name: 'reviewer', active: false, number: 2, color: '#aaa', group: 3, groupColor: '#bbb' },
        { type: 'harness', name: 'builder', tool: 'opencode', model: 'opencode-go/deepseek-v4-pro', run: ['do it'], number: 1 },
      ],
    });
    const loaded = loadProfile('coding') as LoadedProfile;
    expect(loaded.entries.map((e) => e.name)).toEqual(['builder', 'reviewer']);
    const builder = loaded.entries[0];
    expect('tool' in builder && builder.tool).toBe('opencode');
    const reviewer = loaded.entries[1];
    expect(reviewer.dotColor).toBe('#aaa');
    expect(reviewer.group).toBe(3);
    expect(reviewer.groupColor).toBe('#bbb');
  });

  it('parses the docked tab types and the monitors key', () => {
    writeProfile('assist', {
      monitors: [{ persona: 'assistant', targets: ['group:1'] }],
      tabs: [
        { type: 'files', dock: 'left', path: '$root' },
        { type: 'notifications', dock: 'right', focus: true },
        { type: 'schedules', dock: 'right' },
      ],
    });
    const loaded = loadProfile('assist') as LoadedProfile;
    expect(loaded.monitors).toEqual([{ name: 'assistant', persona: 'assistant', targets: ['group:1'] }]);
    expect(loaded.files).toEqual([{ dock: 'left', path: '$root' }]);
    expect(loaded.notifications).toEqual([{ dock: 'right', focus: true }]);
    expect(loaded.schedules).toEqual([{ dock: 'right' }]);
  });

  it('reads layout.sidebar into the flat internal fields', () => {
    writeProfile('assist', {
      layout: { sidebar: { left: 320, right: 280 }, tabAreaPct: 75, window: { width: 1440, height: 900 } },
    });
    const loaded = loadProfile('assist') as LoadedProfile;
    expect(loaded.layout).toEqual({
      window: { width: 1440, height: 900 }, sidebarLeft: 320, sidebarRight: 280, tabAreaPct: 75,
    });
  });

  it('a monitor name defaults to its persona when omitted', () => {
    writeProfile('assist', { monitors: [{ persona: 'security', targets: [] }] });
    const loaded = loadProfile('assist') as LoadedProfile;
    expect(loaded.monitors).toEqual([{ name: 'security', persona: 'security', targets: [] }]);
  });

  it('returns an error for a missing profile file', () => {
    expect(loadProfile('nope')).toHaveProperty('error');
  });
});
