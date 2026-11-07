import { describe, it, expect, vi } from 'vitest';
import { command } from './ask.js';
import type { AcpDispatchReceipt } from '../acp/response.js';
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
  tab: { title?: string } = {},
) {
  const append = vi.fn();
  const managers = { acp: { promptResult }, tab: { append, byLabel: () => tab } } as unknown as Managers;
  const receipt = command.run(dispatcherCommand, { label: 'main', index: 0 }, managers, invocation(line)) as AcpDispatchReceipt;
  return { append, receipt };
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
    const { append, receipt } = run(() => pending.promise, '/ask hello');

    expect(append).not.toHaveBeenCalled();
    pending.resolve({ answered: true, reply: '## Answer', session: 'session-1' });
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask hello',
      output: '## Answer',
      background: receipt.replyId,
    });
  });

  it('returns a receipt naming the reply id, the ask role, and the tab label when the tab has no title', () => {
    const { receipt } = run(() => new Promise<AcpPromptResult>(() => {}));

    expect(receipt).toEqual({ replyId: expect.any(String), role: 'ask', name: 'acp:ask:main' });
  });

  it('names the receipt after the tab title when the tab has one', () => {
    const { receipt } = run(() => new Promise<AcpPromptResult>(() => {}), undefined, 'ask hello', { title: 'Build shell' });

    expect(receipt.name).toBe('acp:ask:Build shell');
  });

  it('starts the prompt under the ask role without appending a refusal to the transcript', () => {
    const promptResult = vi.fn(() => new Promise<AcpPromptResult>(() => {}));

    run(promptResult, '/ask hello');

    expect(promptResult).toHaveBeenCalledExactlyOnceWith('main', 'ask hello', 'ask', {
      appendRefusalToTranscript: false,
    });
  });

  it('gives each dispatch its own reply id, including two refused dispatches of the same line', async () => {
    const refusal = async (): Promise<AcpPromptResult> => ({ answered: false, error: 'ACP: a prompt is already running.' });
    const first = run(refusal, '/ask hello');
    const second = run(refusal, '/ask hello');
    await settle();

    expect(first.receipt.replyId).not.toBe(second.receipt.replyId);
    expect(first.append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask hello', output: 'ACP: a prompt is already running.', background: first.receipt.replyId,
    });
    expect(second.append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask hello', output: 'ACP: a prompt is already running.', background: second.receipt.replyId,
    });
  });

  it('returns the receipt before a refusal settles and settles the refusal under that id', async () => {
    const { append, receipt } = run(async () => ({ answered: false, error: 'Usage: ask <prompt>.' }), '/ask', 'ask');

    expect(receipt.replyId).toEqual(expect.any(String));
    expect(append).not.toHaveBeenCalled();
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask', output: 'Usage: ask <prompt>.', background: receipt.replyId,
    });
  });

  it('appends one capped reply carrying the tool-step notice', async () => {
    const pending = Promise.withResolvers<AcpPromptResult>();
    const { append, receipt } = run(() => pending.promise, '/ask hello');

    pending.resolve({
      answered: true,
      reply: 'Partial answer\n\n(stopped after 8 tool steps)',
      session: 'session-1',
    });
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask hello',
      output: 'Partial answer\n\n(stopped after 8 tool steps)',
      background: receipt.replyId,
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
    const { append, receipt } = run(async () => result, '/ask', 'ask');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: '/ask',
      output: result.error,
      background: receipt.replyId,
    });
  });

  it('echoes the typed line for a malformed invocation rather than the normalized command', async () => {
    const { append, receipt } = run(async () => ({ answered: false, error: 'Usage: ask <prompt>.' }), '/ask   ');

    await settle();

    expect(append).toHaveBeenCalledWith('main', {
      input: '/ask   ',
      output: 'Usage: ask <prompt>.',
      background: receipt.replyId,
    });
  });

  it('turns a rejected prompt into one completed error reply', async () => {
    const { append, receipt } = run(async () => { throw new Error('socket gone\nmore'); }, 'ask hello');

    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'ask hello',
      output: 'ACP error: socket gone\nmore',
      background: receipt.replyId,
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
      tab: { append, byLabel: () => ({}) },
    } as unknown as Managers;

    const receipt = command.run('ask hello', { label: 'main', index: 0 }, managers, invocation('ask hello')) as AcpDispatchReceipt;
    await settle();

    expect(append).toHaveBeenCalledExactlyOnceWith('main', {
      input: 'ask hello',
      output: 'first',
      background: receipt.replyId,
    });
  });
});
