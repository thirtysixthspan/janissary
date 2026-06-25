import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initProfileDir,
  parseProfileCommand,
  listProfiles,
  loadProfileAgents,
  profileExists,
  PROFILE_USAGE,
} from './profiles.js';
import type { AgentState } from './types.js';

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
    const dir = join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ name, dotColor: 'red', active: false, ...state }));
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'janus-prof-'));
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
    const agents = loadProfileAgents('coding');
    expect(agents.map((a) => a.name).toSorted()).toEqual(['bob', 'carol']);
    expect(agents.find((a) => a.name === 'bob')?.cmdHistory).toEqual(['ls']);
  });

  it('orders agents by their number field', () => {
    writeAgent('coding', 'review', { number: 3 });
    writeAgent('coding', 'plan', { number: 1 });
    writeAgent('coding', 'execute', { number: 2 });
    expect(loadProfileAgents('coding').map((a) => a.name)).toEqual(['plan', 'execute', 'review']);
  });

  it('returns no agents for a missing profile', () => {
    expect(loadProfileAgents('nope')).toEqual([]);
  });
});
