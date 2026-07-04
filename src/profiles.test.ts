import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  initProfileDir,
  parseProfileCommand,
  listProfiles,
  loadProfileEntries,
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
});
