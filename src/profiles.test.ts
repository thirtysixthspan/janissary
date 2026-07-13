import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initProfileDir,
  parseProfileCommand,
  listProfiles,
  loadProfileEntries,
  loadProfileMonitors,
  loadProfileFiles,
  profileExists,
  PROFILE_USAGE,
} from './profiles.js';
import type { AgentState, ProfileHarnessEntry } from './types.js';

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

describe('profile directory', () => {
  let root: string;

  const writeAgent = (profile: string, name: string, state: Partial<AgentState>) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ name, dotColor: 'red', active: false, ...state }));
  };

  const writeHarness = (profile: string, filename: string, entry: Partial<ProfileHarnessEntry>) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${filename}.json`), JSON.stringify({ harness: 'opencode', ...entry }));
  };

  const writeFile = (profile: string, filename: string, contents: string) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, filename), contents);
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-prof-'));
    initProfileDir(root);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('lists profile directories sorted', () => {
    writeAgent('surfing', 'alice', {});
    writeAgent('coding', 'bob', {});
    expect(listProfiles()).toEqual(['coding', 'surfing']);
  });

  it('reports profile existence', () => {
    writeAgent('coding', 'bob', {});
    expect(profileExists('coding')).toBe(true);
    expect(profileExists('missing')).toBe(false);
  });

  it('loads each agent file, using the filename as the agent name', () => {
    writeAgent('coding', 'bob', { cmdHistory: ['ls'], name: 'WRONG' });
    writeAgent('coding', 'carol', {});
    const agents = loadProfileEntries('coding') as AgentState[];
    expect(agents.map((a) => a.name).toSorted((a, b) => a.localeCompare(b))).toEqual(['bob', 'carol']);
    expect(agents.find((a) => a.name === 'bob')?.cmdHistory).toEqual(['ls']);
  });

  it('orders agents by their number field', () => {
    writeAgent('coding', 'review', { number: 3 });
    writeAgent('coding', 'plan', { number: 1 });
    writeAgent('coding', 'execute', { number: 2 });
    expect((loadProfileEntries('coding') as AgentState[]).map((a) => a.name)).toEqual(['plan', 'execute', 'review']);
  });

  it('returns no agents for a missing profile', () => {
    expect(loadProfileEntries('nope')).toEqual([]);
  });

  it('parses a harness file into a ProfileHarnessEntry, using the filename as the label', () => {
    writeHarness('coding', 'opencode', { model: 'opencode-go/deepseek-v4-pro', run: ['do it'] });
    const entries = loadProfileEntries('coding') as ProfileHarnessEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0].harness).toBe('opencode');
    expect(entries[0].label).toBe('opencode');
    expect(entries[0].model).toBe('opencode-go/deepseek-v4-pro');
    expect(entries[0].run).toEqual(['do it']);
  });

  it('orders mixed agent and harness entries by their number field', () => {
    writeAgent('mixed', 'reviewer', { number: 2 });
    writeHarness('mixed', 'opencode', { number: 1 });
    const entries = loadProfileEntries('mixed');
    expect(entries.map((e) => ('harness' in e ? e.label : e.name))).toEqual(['opencode', 'reviewer']);
  });

  it('skips invalid JSON files', () => {
    const dir = path.join(root, 'profiles', 'broken');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'bad.json'), '{ not json');
    writeAgent('broken', 'ok', {});
    expect(loadProfileEntries('broken').map((e) => ('harness' in e ? e.label : e.name))).toEqual(['ok']);
  });

  it('parses a harness file with autoApprove and offline flags', () => {
    writeHarness('assist', 'claude', { harness: 'claude', workspace: true, autoApprove: true, offline: true });
    const [entry] = loadProfileEntries('assist') as ProfileHarnessEntry[];
    expect(entry.autoApprove).toBe(true);
    expect(entry.offline).toBe(true);
    expect(entry.workspace).toBe(true);
  });

  it('never loads underscore-prefixed files as entries', () => {
    writeAgent('assist', 'bob', {});
    writeFile('assist', '_monitors.json', JSON.stringify([{ persona: 'assistant', targets: ['group:1'] }]));
    expect(loadProfileEntries('assist').map((e) => ('harness' in e ? e.label : e.name))).toEqual(['bob']);
  });

  it('loads profile monitors from _monitors.json', () => {
    writeFile('assist', '_monitors.json', JSON.stringify([{ persona: 'assistant', targets: ['group:1'] }]));
    expect(loadProfileMonitors('assist')).toEqual([{ persona: 'assistant', targets: ['group:1'] }]);
  });

  it('returns no monitors when the file is absent, unparseable, or not an array', () => {
    writeAgent('none', 'bob', {});
    expect(loadProfileMonitors('none')).toEqual([]);
    writeFile('bad', '_monitors.json', '{ not json');
    expect(loadProfileMonitors('bad')).toEqual([]);
    writeFile('obj', '_monitors.json', JSON.stringify({ persona: 'assistant', targets: [] }));
    expect(loadProfileMonitors('obj')).toEqual([]);
  });

  it('drops malformed monitor elements', () => {
    writeFile('mix', '_monitors.json', JSON.stringify([
      { persona: 'assistant', targets: ['group:1'] },
      { persona: 42, targets: ['group:1'] },
      { persona: 'security', targets: 'group:1' },
      { targets: ['group:1'] },
    ]));
    expect(loadProfileMonitors('mix')).toEqual([{ persona: 'assistant', targets: ['group:1'] }]);
  });

  it('loads profile files from _files.json', () => {
    writeFile('assist', '_files.json', JSON.stringify([{ dock: 'left' }]));
    expect(loadProfileFiles('assist')).toEqual([{ dock: 'left' }]);
  });

  it('returns no files entries when the file is absent, unparseable, or not an array', () => {
    writeAgent('none', 'bob', {});
    expect(loadProfileFiles('none')).toEqual([]);
    writeFile('bad', '_files.json', '{ not json');
    expect(loadProfileFiles('bad')).toEqual([]);
    writeFile('obj', '_files.json', JSON.stringify({ dock: 'left' }));
    expect(loadProfileFiles('obj')).toEqual([]);
  });

  it('drops malformed files elements', () => {
    writeFile('mix', '_files.json', JSON.stringify([
      { dock: 'left' },
      { dock: 'up' },
      { in: 42 },
      { dock: 'right', in: 'claude' },
    ]));
    expect(loadProfileFiles('mix')).toEqual([{ dock: 'left' }, { dock: 'right', in: 'claude' }]);
  });
});
