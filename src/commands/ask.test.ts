import { describe, it, expect, vi } from 'vitest';
import { command } from './ask.js';
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
  dispatcherCommand = 'ask hello',
) {
  const append = vi.fn();
  const managers = { acp: { promptResult }, tab: { append } } as unknown as Managers;
  command.run(dispatcherCommand, { label: 'main', index: 0 }, managers, invocation(line));
  return { append };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ask command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('ask');
  });

  it('matches ask commands', () => {
    expect(command.match('ask summarize this repo')).toBe(true);
    expect(command.match('ASK summarize this repo')).toBe(true);
    expect(command.match('ask')).toBe(true);
  });

  it('does not match non-ask input', () => {
    expect(command.match('ask-extra')).toBe(true); // \b matches before '-'
    expect(command.match('ask  ')).toBe(true);
    expect(command.match('asking')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  it('no longer answers to the former acp command word', () => {
    expect(command.match('acp summarize this repo')).toBe(false);
    expect(command.match('acp')).toBe(false);
  });

  it('returns immediately and appends one completed background reply when the prompt settles', async () => {
    const pending = Promise.withResolvers<AcpPromptResult>();
    const { append } = run(() => pending.promise, '/ask hello');

    expect(append).not.toHaveBeenCalled();
    pending.resolve({ answered: true, reply: '## Answer', session: 'session-1' });
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask hello',
      output: '## Answer',
      background: expect.any(String),
    });
  });

  it('appends one capped reply carrying the tool-step notice', async () => {
    const pending = Promise.withResolvers<AcpPromptResult>();
    const { append } = run(() => pending.promise, '/ask hello');

    pending.resolve({
      answered: true,
      reply: 'Partial answer\n\n(stopped after 8 tool steps)',
      session: 'session-1',
    });
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask hello',
      output: 'Partial answer\n\n(stopped after 8 tool steps)',
      background: expect.any(String),
    });
  });

  it.each([
    ['usage', { answered: false, error: 'Usage: ask <prompt>.' }],
    ['already running', { answered: false, error: 'ACP: a prompt is already running.' }],
    ['no model', { answered: false, error: 'ACP: the ask role lists no models.' }],
    ['still connecting', { answered: false, error: 'ACP: the remote session is still connecting.' }],
    ['start failure', { answered: false, error: 'ACP error: spawn failed' }],
    ['prompt failure', { answered: false, error: 'ACP error: rate limited' }],
    ['fatal connection loss', { answered: false, error: 'ACP: connection lost' }],
    ['closed session', { answered: false, error: 'ACP session closed.' }],
    ['cancellation', { answered: false, error: 'ACP: prompt cancelled.' }],
  ])('appends the exact %s text once', async (_case, result) => {
    const { append } = run(async () => result, '/ask', 'ask');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask',
      output: result.error,
      background: expect.any(String),
    });
  });

  it('echoes the typed line for a malformed invocation rather than the normalized command', async () => {
    const { append } = run(async () => ({ answered: false, error: 'Usage: ask <prompt>.' }), '/ask   ');

    await settle();

    expect(append).toHaveBeenCalledWith('main', {
      input: '/ask   ',
      output: 'Usage: ask <prompt>.',
      background: expect.any(String),
    });
  });

  it('turns a rejected prompt into one completed error reply', async () => {
    const { append } = run(async () => { throw new Error('socket gone\nmore'); }, 'ask hello');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'ask hello',
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

    command.run('ask hello', { label: 'main', index: 0 }, managers, invocation('ask hello'));
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'ask hello',
      output: 'first',
      background: expect.any(String),
    });
  });
});
