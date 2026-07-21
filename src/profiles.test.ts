import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initProfileDir, parseProfileCommand, listProfiles, loadProfile, profileExists, profilePath, PROFILE_USAGE,
} from './profiles.js';
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

  const writeProfile = (name: string, file: ProfileFile) => {
    writeFileSync(path.join(root, 'profiles', `${name}.json`), JSON.stringify(file));
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-prof-'));
    initProfileDir(root);
    mkdirSync(path.join(root, 'profiles'), { recursive: true });
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('lists profile files (extension stripped) sorted', () => {
    writeProfile('surfing', {});
    writeProfile('coding', {});
    expect(listProfiles()).toEqual(['coding', 'surfing']);
  });

  it('resolves profilePath/profileExists to the file', () => {
    writeProfile('coding', {});
    expect(profilePath('coding')).toBe(path.join(root, 'profiles', 'coding.json'));
    expect(profileExists('coding')).toBe(true);
    expect(profileExists('missing')).toBe(false);
  });

  it('loads agents and harnesses ordered by tab.number, each entry name as its label', () => {
    writeProfile('coding', {
      agents: [{ name: 'reviewer', active: false, tab: { number: 2, color: '#aaa', group: 3, groupColor: '#bbb' } }],
      harnesses: [{ name: 'builder', type: 'opencode', model: 'opencode-go/deepseek-v4-pro', run: ['do it'], tab: { number: 1 } }],
    });
    const loaded = loadProfile('coding') as LoadedProfile;
    expect(loaded.entries.map((e) => e.name)).toEqual(['builder', 'reviewer']);
    const builder = loaded.entries[0];
    expect('type' in builder && builder.type).toBe('opencode');
    const reviewer = loaded.entries[1];
    expect(reviewer.dotColor).toBe('#aaa');
    expect(reviewer.group).toBe(3);
    expect(reviewer.groupColor).toBe('#bbb');
  });

  it('parses the reserved config sections', () => {
    writeProfile('assist', {
      monitors: [{ persona: 'assistant', targets: ['group:1'] }],
      files: [{ dock: 'left', path: '$root' }],
      notifications: [{ dock: 'right', focus: true }],
      schedules: [{ dock: 'right' }],
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
