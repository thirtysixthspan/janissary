import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from './profile.js';
import { initProfileDir } from '../profiles.js';
import { initAgentStateDirectory, loadAgentState } from '../agent-state.js';
import type { AgentState, Tab } from '../types.js';
import type { CommandHandlerContext } from './types.js';

describe('profile command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('profile');
  });

  it('matches profile commands case-insensitively', () => {
    expect(command.match('profile launch coding')).toBe(true);
    expect(command.match('PROFILE list')).toBe(true);
    expect(command.match('profile')).toBe(true);
  });

  it('does not match non-profile input', () => {
    expect(command.match('profiles')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('profile command handler', () => {
  let root: string;
  let baseTabs: Tab[];
  let appended: Tab[];
  let active: number | undefined;
  let outputs: string[];
  let cwdReference: { current: Record<string, string> };
  let context: CommandHandlerContext;

  const writeAgent = (profile: string, name: string, state: Partial<AgentState>) => {
    const dir = path.join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ name, dotColor: 'red', active: false, ...state }));
  };

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-profcmd-'));
    initProfileDir(root);
    initAgentStateDirectory(root);
    baseTabs = [{ label: 'janus' } as Tab];
    appended = [];
    active = undefined;
    outputs = [];
    cwdReference = { current: {} };
    context = {
      tabs: baseTabs,
      updateCurrentTab: (u: (tab: { log: { output: string }[] }) => { log: { output: string }[] }) => {
        outputs.push(u({ label: 'janus', log: [], scrollOffset: 0 } as never).log.at(-1)!.output);
      },
      setTabs: (u: (previous: Tab[]) => Tab[]) => { appended = u(baseTabs).slice(baseTabs.length); },
      setActiveTab: (v: number) => { active = v; },
      cwdRef: cwdReference,
      initAgentState: (name: string) => {
        const s = loadAgentState(name);
        return { cmdHistory: s?.cmdHistory, log: s?.log, cwd: s?.cwd, workspaceDir: s?.workspaceDir };
      },
    } as unknown as CommandHandlerContext;
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const run = (command_: string) => command.handler(command_, context);

  it('launches a profile, opening a tab per agent and focusing the first', () => {
    writeAgent('coding', 'bob', { dotColor: '#abcdef', cmdHistory: ['ls'], cwd: '/work/bob' });
    writeAgent('coding', 'carol', {});
    run('profile launch coding');

    expect(appended.map((t) => t.label).toSorted((a, b) => a.localeCompare(b))).toEqual(['bob', 'carol']);
    expect(active).toBe(1);
    expect(cwdReference.current.bob).toBe('/work/bob');
    expect(appended.find((t) => t.label === 'bob')?.dotColor).toBe('#abcdef');
    expect(loadAgentState('bob')?.cmdHistory).toEqual(['ls']);
    expect(outputs.at(-1)).toContain('Launched profile "coding"');
  });

  it('skips agents whose tab is already open', () => {
    baseTabs.push({ label: 'bob' } as Tab);
    writeAgent('coding', 'bob', {});
    writeAgent('coding', 'carol', {});
    run('profile launch coding');
    expect(appended.map((t) => t.label)).toEqual(['carol']);
    expect(outputs.at(-1)).toContain('Already open: bob');
  });

  it('reports a missing profile', () => {
    run('profile launch nope');
    expect(outputs.at(-1)).toBe('No profile named "nope".');
    expect(appended).toEqual([]);
  });

  it('lists available profiles', () => {
    writeAgent('coding', 'bob', {});
    writeAgent('surfing', 'alice', {});
    run('profile list');
    expect(outputs.at(-1)).toBe('coding\nsurfing');
  });

  it('reports a usage error for a malformed command', () => {
    run('profile bogus');
    expect(outputs.at(-1)).toContain('Usage:');
  });
});
