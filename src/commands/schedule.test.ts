import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from './schedule.js';
import { initAgentStateDir, saveAgentState, loadAgentState } from '../agent-state.js';
import type { AgentState } from '../types.js';
import type { CommandHandlerContext } from './types.js';

describe('schedule command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('schedule');
  });

  it('matches schedule commands case-insensitively', () => {
    expect(command.match('schedule every 5m echo hi')).toBe(true);
    expect(command.match('SCHEDULE list')).toBe(true);
    expect(command.match('schedule')).toBe(true);
  });

  it('does not match non-schedule input', () => {
    expect(command.match('scheduled')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });
});

describe('schedule command handler', () => {
  let dir: string;
  let states: Record<string, AgentState>;
  let outputs: string[];
  let context: CommandHandlerContext;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'janus-sched-'));
    initAgentStateDir(dir);
    const initial: AgentState = { name: 'janus', dotColor: 'red', active: false };
    saveAgentState(initial);
    states = { janus: initial };
    outputs = [];
    context = {
      tabs: [{ label: 'janus' }],
      activeTab: 0,
      updateCurrentTab: (u: (tab: { label: string; log: { output: string }[]; scrollOffset: number }) => { log: { output: string }[] }) => {
        const tab = u({ label: 'janus', log: [], scrollOffset: 0 });
        outputs.push(tab.log.at(-1).output);
      },
      setAgentStates: (u: (previous: Record<string, AgentState>) => Record<string, AgentState>) => {
        states = u(states);
      },
    } as unknown as CommandHandlerContext;
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const run = (command_: string) => command.handler(command_, context);

  it('adds a named entry and persists it to the state file', () => {
    run('schedule fetch every 5m echo hi');
    const saved = loadAgentState('janus')?.schedule ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'fetch', command: 'echo hi', spec: 'every 5m', recurring: true });
    expect(outputs.at(-1)).toContain('Scheduled fetch');
  });

  it('errors on a named timer with no schedule form and leaves state untouched', () => {
    run('schedule deploy');
    expect(outputs.at(-1)).toContain('Usage:');
    expect(loadAgentState('janus')?.schedule).toBeUndefined();
  });

  it('lists entries by name', () => {
    run('schedule a every 5m echo a');
    run('schedule b at 3pm echo b');
    const saved = loadAgentState('janus')?.schedule ?? [];
    expect(saved.map((entry) => entry.id)).toEqual(['a', 'b']);

    run('schedule list');
    const listing = outputs.at(-1);
    expect(listing).toContain('a');
    expect(listing).toContain('b');
    expect(listing).toContain('echo a');
  });

  it('cancels a single entry by name', () => {
    run('schedule a every 5m echo a');
    run('schedule b every 1h echo b');
    run('schedule cancel a');
    const saved = loadAgentState('janus')?.schedule ?? [];
    expect(saved.map((entry) => entry.id)).toEqual(['b']);
    expect(outputs.at(-1)).toBe('Cancelled a.');
  });

  it('reports cancelling an unknown name', () => {
    run('schedule cancel nope');
    expect(outputs.at(-1)).toBe('No scheduled command "nope".');
  });

  it('clears all entries', () => {
    run('schedule a every 5m echo a');
    run('schedule clear');
    expect(loadAgentState('janus')?.schedule ?? []).toHaveLength(0);
    expect(outputs.at(-1)).toContain('Cleared 1');
  });

  it('rejects a duplicate name', () => {
    run('schedule deploy at 3pm npm run deploy');
    run('schedule deploy every 5m echo hi');
    expect(loadAgentState('janus')?.schedule ?? []).toHaveLength(1);
    expect(outputs.at(-1)).toContain('already exists');
  });

  it('cancels a named entry by name', () => {
    run('schedule deploy at 3pm npm run deploy');
    run('schedule cancel deploy');
    expect(loadAgentState('janus')?.schedule ?? []).toHaveLength(0);
    expect(outputs.at(-1)).toBe('Cancelled deploy.');
  });
});
