import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './profile.js';
import { initProfileDir } from '../profiles.js';
import { initAgentStateDir, loadAgentState } from '../agent-state.js';
import type { AgentState, CommandHandlerContext, Tab } from '../types.js';

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
  let cwdRef: { current: Record<string, string> };
  let ctx: CommandHandlerContext;

  const writeAgent = (profile: string, name: string, state: Partial<AgentState>) => {
    const dir = join(root, 'profiles', profile);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ name, dotColor: 'red', active: false, ...state }));
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'janus-profcmd-'));
    initProfileDir(root);
    initAgentStateDir(root);
    baseTabs = [{ label: 'janus' } as Tab];
    appended = [];
    active = undefined;
    outputs = [];
    cwdRef = { current: {} };
    ctx = {
      tabs: baseTabs,
      updateCurrentTab: (u: (tab: { log: { output: string }[] }) => { log: { output: string }[] }) => {
        outputs.push(u({ label: 'janus', log: [], scrollOffset: 0 } as never).log.at(-1)!.output);
      },
      setTabs: (u: (prev: Tab[]) => Tab[]) => { appended = u(baseTabs).slice(baseTabs.length); },
      setActiveTab: (v: number) => { active = v; },
      cwdRef,
      initAgentState: (name: string) => {
        const s = loadAgentState(name);
        return { cmdHistory: s?.cmdHistory, log: s?.log, cwd: s?.cwd, workspaceDir: s?.workspaceDir };
      },
    } as unknown as CommandHandlerContext;
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const run = (cmd: string) => command.handler(cmd, ctx);

  it('launches a profile, opening a tab per agent and focusing the first', () => {
    writeAgent('coding', 'bob', { dotColor: '#abcdef', cmdHistory: ['ls'], cwd: '/work/bob' });
    writeAgent('coding', 'carol', {});
    run('profile launch coding');

    expect(appended.map((t) => t.label).sort()).toEqual(['bob', 'carol']);
    expect(active).toBe(1);
    expect(cwdRef.current.bob).toBe('/work/bob');
    expect(appended.find((t) => t.label === 'bob')?.dotColor).toBe('#abcdef');
    expect(loadAgentState('bob')?.cmdHistory).toEqual(['ls']);
    expect(outputs[outputs.length - 1]).toContain('Launched profile "coding"');
  });

  it('skips agents whose tab is already open', () => {
    baseTabs.push({ label: 'bob' } as Tab);
    writeAgent('coding', 'bob', {});
    writeAgent('coding', 'carol', {});
    run('profile launch coding');
    expect(appended.map((t) => t.label)).toEqual(['carol']);
    expect(outputs[outputs.length - 1]).toContain('Already open: bob');
  });

  it('reports a missing profile', () => {
    run('profile launch nope');
    expect(outputs[outputs.length - 1]).toBe('No profile named "nope".');
    expect(appended).toEqual([]);
  });

  it('lists available profiles', () => {
    writeAgent('coding', 'bob', {});
    writeAgent('surfing', 'alice', {});
    run('profile list');
    expect(outputs[outputs.length - 1]).toBe('coding\nsurfing');
  });

  it('reports a usage error for a malformed command', () => {
    run('profile bogus');
    expect(outputs[outputs.length - 1]).toContain('Usage:');
  });
});
