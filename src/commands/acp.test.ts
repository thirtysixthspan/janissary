import { describe, it, expect, vi } from 'vitest';
import { command } from './acp.js';
import type { AcpPromptResult } from '../acp/types.js';
import type { CommandInvocationContext } from './types.js';
import type { Managers } from '../managers.js';

function invocation(line?: string): CommandInvocationContext {
  return {
    runId: 'run',
    invocationId: 'invocation',
    caller: { label: 'main', cwd: '/repo', context: [] },
    signal: new AbortController().signal,
    ...(line !== undefined && { line }),
  };
}

function run(
  promptResult: (label: string, command: string) => Promise<AcpPromptResult>,
  line?: string,
  dispatcherCommand = 'acp hello',
) {
  const append = vi.fn();
  const managers = { acp: { promptResult }, tab: { append } } as unknown as Managers;
  command.run(dispatcherCommand, { label: 'main', index: 0 }, managers, invocation(line));
  return { append };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('acp command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('acp');
  });

  it('matches acp commands', () => {
    expect(command.match('acp summarize this repo')).toBe(true);
    expect(command.match('ACP summarize this repo')).toBe(true);
    expect(command.match('acp')).toBe(true);
  });

  it('does not match non-acp input', () => {
    expect(command.match('acp-extra')).toBe(true); // \b matches before '-'
    expect(command.match('acp  ')).toBe(true);
    expect(command.match('clear')).toBe(false);
  });

  it('returns immediately and appends one completed background reply when the prompt settles', async () => {
    const pending = Promise.withResolvers<AcpPromptResult>();
    const { append } = run(() => pending.promise, '/acp hello');

    expect(append).not.toHaveBeenCalled();
    pending.resolve({ answered: true, reply: '## Answer', session: 'session-1' });
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/acp hello',
      output: '## Answer',
      background: expect.any(String),
    });
  });

  it('appends one capped reply carrying the tool-step notice', async () => {
    const pending = Promise.withResolvers<AcpPromptResult>();
    const { append } = run(() => pending.promise, '/acp hello');

    pending.resolve({
      answered: true,
      reply: 'Partial answer\n\n(stopped after 8 tool steps)',
      session: 'session-1',
    });
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/acp hello',
      output: 'Partial answer\n\n(stopped after 8 tool steps)',
      background: expect.any(String),
    });
  });

  it.each([
    ['usage', { answered: false, error: 'Usage: acp <prompt>.' }],
    ['already running', { answered: false, error: 'ACP: a prompt is already running.' }],
    ['no model', { answered: false, error: 'ACP: no opencode model is available in the harness catalog.' }],
    ['still connecting', { answered: false, error: 'ACP: the remote session is still connecting.' }],
    ['start failure', { answered: false, error: 'ACP error: spawn failed' }],
    ['prompt failure', { answered: false, error: 'ACP error: rate limited' }],
    ['fatal connection loss', { answered: false, error: 'ACP: connection lost' }],
    ['closed session', { answered: false, error: 'ACP session closed.' }],
    ['cancellation', { answered: false, error: 'ACP: prompt cancelled.' }],
  ])('appends the exact %s text once', async (_case, result) => {
    const { append } = run(async () => result, '/acp', 'acp');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/acp',
      output: result.error,
      background: expect.any(String),
    });
  });

  it('echoes the typed line for a malformed invocation rather than the normalized command', async () => {
    const { append } = run(async () => ({ answered: false, error: 'Usage: acp <prompt>.' }), '/acp   ');

    await settle();

    expect(append).toHaveBeenCalledWith('main', {
      input: '/acp   ',
      output: 'Usage: acp <prompt>.',
      background: expect.any(String),
    });
  });

  it('turns a rejected prompt into one completed error reply', async () => {
    const { append } = run(async () => { throw new Error('socket gone\nmore'); }, 'acp hello');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'acp hello',
      output: 'ACP error: socket gone\nmore',
      background: expect.any(String),
    });
  });

  it('guards against a competing settlement appending twice', async () => {
    const append = vi.fn();
    const result: AcpPromptResult = { answered: true, reply: 'first', session: 'session-1' };
    const competing = new Proxy(Promise.resolve(result), {
      get(target, property, receiver) {
        if (property === 'then') {
          return (resolve: (value: AcpPromptResult) => void, reject: (error: unknown) => void) => {
            resolve(result);
            reject(new Error('late failure'));
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const managers = {
      acp: { promptResult: () => competing },
      tab: { append },
    } as unknown as Managers;

    command.run('acp hello', { label: 'main', index: 0 }, managers, invocation('acp hello'));
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'acp hello',
      output: 'first',
      background: expect.any(String),
    });
  });
});
