import { describe, expect, it, vi } from 'vitest';
import { ShellCommandQueue } from './shell-command-queue';

// A server queue held in an array, so a case can see exactly what was queued and in which order.
function makeQueue(options: { busy?: boolean; writesToShell?: (line: string) => boolean } = {}) {
  const pending: string[] = [];
  const ran: string[] = [];
  const transport = {
    enqueue: vi.fn(async (line: string) => { pending.push(line); }),
    dequeue: vi.fn(async () => pending.shift() ?? null),
  };
  const queue = new ShellCommandQueue(transport, async (line) => {
    ran.push(line);
    return options.writesToShell?.(line) ?? true;
  }, options.busy ?? false);
  return { queue, pending, ran, transport };
}

async function settle() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('ShellCommandQueue', () => {
  it('leaves a line to the caller while zsh is idle', () => {
    const { queue, transport } = makeQueue();

    expect(queue.submit('ls')).toBe(false);
    expect(transport.enqueue).not.toHaveBeenCalled();
  });

  it('queues a line while zsh is busy', () => {
    const { queue, pending } = makeQueue({ busy: true });

    expect(queue.submit('ls')).toBe(true);
    expect(pending).toEqual(['ls']);
  });

  it('runs one queued shell line per prompt', async () => {
    const { queue, pending, ran } = makeQueue({ busy: true });
    queue.submit('first');
    queue.submit('second');

    queue.setBusy(false);
    await settle();
    expect(ran).toEqual(['first']);
    expect(pending).toEqual(['second']);

    queue.setBusy(true);
    queue.setBusy(false);
    await settle();
    expect(ran).toEqual(['first', 'second']);
  });

  it('keeps draining past lines that never reach zsh', async () => {
    const { queue, ran } = makeQueue({ busy: true, writesToShell: (line) => line === 'ls' });
    queue.submit('help');
    queue.submit('theme');
    queue.submit('ls');
    queue.submit('pwd');

    queue.setBusy(false);
    await settle();

    expect(ran).toEqual(['help', 'theme', 'ls']);
  });

  it('queues a new line behind a drain still in progress', async () => {
    const { queue, pending, transport } = makeQueue({ busy: true, writesToShell: () => false });
    queue.submit('help');
    transport.dequeue.mockImplementationOnce(async () => {
      expect(queue.submit('late')).toBe(true);
      return pending.shift() ?? null;
    });

    queue.setBusy(false);
    await settle();

    expect(pending).toEqual([]);
    expect(queue.submit('after')).toBe(false);
  });

  it('stops asking for lines once disposed', async () => {
    const { queue, ran } = makeQueue({ busy: true });
    queue.submit('ls');
    queue.dispose();

    queue.setBusy(false);
    await settle();

    expect(ran).toEqual([]);
  });
});
