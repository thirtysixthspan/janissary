import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from '../commands/types.js';
import type { AgentSnapshot } from './types.js';
import { runGrantedAgentCommand } from './command-tools.js';

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
  it('denies ungranted commands before invoking the canonical dispatcher', async () => {
    const dispatch = vi.fn();
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('browser goto https://example.com', snapshot, managers, invocation('one')))
      .resolves.toBe('Agent: command not permitted: browser goto https://example.com.');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('refuses file write and edit forms even with the file grant, before dispatch', async () => {
    const dispatch = vi.fn(async () => ({ dispatched: true, output: 'read' }));
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;
    const fileSnapshot: AgentSnapshot = { ...snapshot, grants: ['file'] };

    for (const command of ['file write {"path":"a.md"}', 'file edit {"path":"a.md"}', '/file write {"path":"a.md"}', 'file edit {']) {
      await expect(runGrantedAgentCommand(command, fileSnapshot, managers, invocation('w')))
        .resolves.toBe(`Agent: command not permitted: ${command}.`);
    }
    expect(dispatch).not.toHaveBeenCalled();
    await expect(runGrantedAgentCommand('file read a.md', fileSnapshot, managers, invocation('r'))).resolves.toBe('read');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('refuses file glob lines with or without the file grant, before dispatch', async () => {
    const dispatch = vi.fn(async () => ({ dispatched: true, output: 'read' }));
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    for (const grants of [['file'], []]) {
      for (const command of ['file glob **/*', 'file glob', '/file glob x']) {
        await expect(runGrantedAgentCommand(command, { ...snapshot, grants }, managers, invocation('g')))
          .resolves.toBe(`Agent: command not permitted: ${command}.`);
      }
    }
    expect(dispatch).not.toHaveBeenCalled();
    await expect(runGrantedAgentCommand('file read a.md', { ...snapshot, grants: ['file'] }, managers, invocation('r')))
      .resolves.toBe('read');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not treat file globs as a glob line, leaving it to the grant check', async () => {
    const dispatch = vi.fn(async () => ({ dispatched: true, output: 'not a glob' }));
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('file globs x', { ...snapshot, grants: ['file'] }, managers, invocation('s')))
      .resolves.toBe('not a glob');
    expect(dispatch).toHaveBeenCalledWith('janus', 'file globs x', expect.anything());
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
    expect(dispatch.mock.calls.every((call) => call[2].awaitResult === true)).toBe(true);
  });

  it('returns only the output of a core-response command, never the JSON of its result', async () => {
    const receipt = { replyId: 'reply-1', role: 'ask', name: 'acp:ask:janus' };
    const dispatch = vi.fn(async () => ({ dispatched: true, output: '', coreResponse: true, result: receipt }));
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('ask hello', { ...snapshot, grants: ['ask'] }, managers, invocation('core')))
      .resolves.toBe('');
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('keeps returning a string result as is and an object result as JSON for a non-core reply', async () => {
    const dispatch = vi.fn()
      .mockResolvedValueOnce({ dispatched: true, output: 'ignored', result: 'plain text' })
      .mockResolvedValueOnce({ dispatched: true, output: 'ignored', result: { id: 'one', count: 2 } });
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('question ask "first"', snapshot, managers, invocation('string')))
      .resolves.toBe('plain text');
    await expect(runGrantedAgentCommand('question ask "second"', snapshot, managers, invocation('object')))
      .resolves.toBe('{"id":"one","count":2}');
  });

  it('requires the selected ask-user skill as well as the question grant', async () => {
    const dispatch = vi.fn();
    const noSkill = { ...snapshot, skills: [] };
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('question ask "need help"', noSkill, managers, invocation('one')))
      .resolves.toContain('command not permitted');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns the dispatch refusal for a granted command disabled by settings', async () => {
    const dispatch = vi.fn(async () => ({ dispatched: true, output: 'Command is disabled: question.' }));
    const managers = { command: { dispatchLineInInvocation: dispatch } } as unknown as Managers;

    await expect(runGrantedAgentCommand('question ask "first"', snapshot, managers, invocation('disabled')))
      .resolves.toBe('Command is disabled: question.');
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
