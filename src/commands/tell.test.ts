import { describe, it, expect, vi } from 'vitest';
import { command } from './tell.js';
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
  promptResult: (label: string, command: string, role: string) => Promise<AcpPromptResult>,
  line?: string,
  dispatcherCommand = 'tell hello',
) {
  const append = vi.fn();
  const managers = { acp: { promptResult }, tab: { append } } as unknown as Managers;
  command.run(dispatcherCommand, { label: 'main', index: 0 }, managers, invocation(line));
  return { append };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('tell command', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('tell');
  });

  it('matches tell commands case-insensitively with ask word-boundary behavior', () => {
    expect(command.match('tell summarize this repo')).toBe(true);
    expect(command.match('TELL summarize this repo')).toBe(true);
    expect(command.match('tell')).toBe(true);
    expect(command.match('tell-extra')).toBe(true);
    expect(command.match('telling')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  it('passes the tell role and preserves the exact typed line in one background reply', async () => {
    const pending = Promise.withResolvers<AcpPromptResult>();
    const promptResult = vi.fn(() => pending.promise);
    const { append } = run(promptResult, '  /TeLl   release notes  ', 'tell release notes');

    expect(promptResult).toHaveBeenCalledExactlyOnceWith('main', 'tell release notes', 'tell', {
      appendRefusalToTranscript: false,
    });
    expect(append).not.toHaveBeenCalled();
    pending.resolve({ answered: true, reply: '## Done', session: 'tell-session' });
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '  /TeLl   release notes  ', output: '## Done', background: expect.any(String),
    });
  });

  it.each([
    ['usage', { answered: false, error: 'Usage: tell <prompt>.' }],
    ['same-role refusal', { answered: false, error: 'ACP: a prompt is already running.' }],
    ['no model', { answered: false, error: 'ACP: the tell role lists no models.' }],
    ['closed session', { answered: false, error: 'ACP session closed.' }],
    ['cancellation', { answered: false, error: 'ACP: prompt cancelled.' }],
  ])('appends the exact %s text once', async (_case, result) => {
    const { append } = run(async () => result, '/tell');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/tell', output: result.error, background: expect.any(String),
    });
  });

  it('turns a rejected prompt into one completed error reply', async () => {
    const { append } = run(async () => { throw new Error('socket gone\nmore'); }, 'tell publish changes');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'tell publish changes', output: 'ACP error: socket gone\nmore', background: expect.any(String),
    });
  });

  it('guards against a competing settlement appending twice', async () => {
    const append = vi.fn();
    const result: AcpPromptResult = { answered: true, reply: 'first', session: 'tell-session' };
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
    const managers = { acp: { promptResult: () => competing }, tab: { append } } as unknown as Managers;

    command.run('tell hello', { label: 'main', index: 0 }, managers, invocation('tell hello'));
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'tell hello', output: 'first', background: expect.any(String),
    });
  });
});
