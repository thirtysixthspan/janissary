import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeAndCapture } from './execute-and-capture.js';
import { messageBus } from '../bus.js';
import { makeTab } from '../tab/index.js';

function append(label: string, output: string, invocationId?: string): void {
  messageBus.emit('transcript', {
    type: 'entry:appended', tabLabel: label, entry: { input: 'cmd', output }, tab: makeTab(label, '#fff'),
    ...(invocationId !== undefined && { invocationId }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('executeAndCapture', () => {
  it('collects every entry appended to the named tab while the run lasts, in order', async () => {
    const outputs = await executeAndCapture('janus', async () => {
      append('janus', 'first');
      await Promise.resolve();
      append('janus', 'second');
    });

    expect(outputs).toEqual(['first', 'second']);
  });

  it('ignores entries appended to another tab', async () => {
    const outputs = await executeAndCapture('janus', async () => {
      append('agent2', 'elsewhere');
      append('janus', 'here');
    });

    expect(outputs).toEqual(['here']);
  });

  it('filters overlapping same-tab output by invocation identity', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const firstCapture = executeAndCapture('janus', async () => {
      await first.promise;
      append('janus', 'first result', 'first');
    }, undefined, 'first');
    const secondCapture = executeAndCapture('janus', async () => {
      await second.promise;
      append('janus', 'second result', 'second');
    }, undefined, 'second');

    append('janus', 'unrelated');
    second.resolve();
    first.resolve();

    await expect(firstCapture).resolves.toEqual(['first result']);
    await expect(secondCapture).resolves.toEqual(['second result']);
  });

  it('stops listening once the run finishes', async () => {
    const outputs = await executeAndCapture('janus', async () => {
      append('janus', 'during');
    });
    append('janus', 'after');

    expect(outputs).toEqual(['during']);
  });

  it('answers with what was said so far when the run outlives the limit', async () => {
    vi.useFakeTimers();
    const late = Promise.withResolvers<void>();
    const captured = executeAndCapture('janus', async () => {
      append('janus', 'started');
      await late.promise;
      append('janus', 'finished');
    }, 10);

    await vi.advanceTimersByTimeAsync(10);
    late.resolve();

    await expect(captured).resolves.toEqual(['started']);
  });

  it('does not include a late same-invocation append after capture settles', async () => {
    vi.useFakeTimers();
    const late = Promise.withResolvers<void>();
    const captured = executeAndCapture('janus', async () => {
      append('janus', 'started', 'invocation');
      await late.promise;
      append('janus', 'finished', 'invocation');
    }, 10, 'invocation');

    await vi.advanceTimersByTimeAsync(10);
    await expect(captured).resolves.toEqual(['started']);
    late.resolve();
    await Promise.resolve();
  });

  it('stops listening even when the run rejects', async () => {
    const unsubscribe = vi.fn();
    const on = vi.spyOn(messageBus, 'on').mockReturnValue({ unsubscribe });

    await expect(executeAndCapture('janus', async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');

    expect(on).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    on.mockRestore();
  });
});
