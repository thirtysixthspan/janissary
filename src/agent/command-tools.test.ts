import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { AgentSnapshot } from './types.js';
import { extractAgentCommand, runGrantedAgentCommand } from './command-tools.js';

const snapshot: AgentSnapshot = Object.freeze({
  taskPath: '/task.md', taskText: 'task', skills: [{ name: 'ask-user', path: '/skill.md', instructions: 'ask' }], grants: Object.freeze(['question']),
});

function invocation(id: string): CommandInvocationContext {
  return {
    runId: id,
    invocationId: `invocation-${id}`,
    caller: { label: 'janus', cwd: '/project', context: [] },
    signal: new AbortController().signal,
  };
}

describe('agent command tools', () => {
  it('extracts only a final command outside fenced examples', () => {
    expect(extractAgentCommand('janissary question ask "old"\n\n```\njanissary question ask "example"\n```', true)).toBe('question ask "old"');
    expect(extractAgentCommand('janissary question ask "example"\n\nDone.', true)).toBeNull();
    expect(extractAgentCommand('Answer\njanissary question ask "real"', true)).toBe('question ask "real"');
    expect(extractAgentCommand('question ask "no skill"', false)).toBeNull();
  });

  it('denies ungranted commands before invoking the canonical dispatcher', async () => {
    const dispatch = vi.fn();
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('browser goto https://example.com', snapshot, managers, invocation('one')))
      .resolves.toBe('Agent: command not permitted: browser goto https://example.com.');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches granted commands through the caller context and isolates overlapping replies', async () => {
    const dispatch = vi.fn(async (_label: string, input: string, context: CommandInvocationContext) => ({
      dispatched: true,
      output: `${context.runId}:${input}`,
    }));
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;
    const answers = await Promise.all([
      runGrantedAgentCommand('question ask "first"', snapshot, managers, invocation('first')),
      runGrantedAgentCommand('question ask "second"', snapshot, managers, invocation('second')),
    ]);

    expect(answers).toEqual(['first:question ask "first"', 'second:question ask "second"']);
    expect(dispatch.mock.calls.map((call) => call[2].runId)).toEqual(['first', 'second']);
  });

  it('requires the selected ask-user skill as well as the question grant', async () => {
    const dispatch = vi.fn();
    const noSkill = { ...snapshot, skills: [] };
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('question ask "need help"', noSkill, managers, invocation('one')))
      .resolves.toContain('command not permitted');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
