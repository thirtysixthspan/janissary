import { describe, expect, it, vi } from 'vitest';
import { ShellCommandQueue } from './shell-command-queue';

// A server queue held in an array, so a case can see exactly what was queued and in which order.
function makeQueue(options: { busy?: boolean; writesToShell?: (line: string) => boolean } = {}) {
  const pending: string[] = [];
  const ran: string[] = [];
  const runner = vi.fn(async (line: string, _queued: boolean) => {
    ran.push(line);
    return options.writesToShell?.(line) ?? true;
  });
  const transport = {
    enqueue: vi.fn(async (line: string) => { pending.push(line); }),
    dequeue: vi.fn(async () => pending.shift() ?? null),
  };
  const queue = new ShellCommandQueue(transport, runner, options.busy ?? false);
  return { queue, pending, ran, runner, transport };
}

async function settle() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('ShellCommandQueue', () => {
  it('runs a line submitted while zsh is idle without queueing it', async () => {
    const { queue, runner, transport } = makeQueue();

    expect(queue.submit('ls')).toBe(false);
    await settle();

    expect(runner).toHaveBeenCalledWith('ls', false);
    expect(transport.enqueue).not.toHaveBeenCalled();
  });

  it('queues a second line submitted before zsh reports the first one as running', async () => {
    const { queue, pending, ran, runner } = makeQueue();

    expect(queue.submit('ssh host')).toBe(false);
    expect(queue.submit('ls')).toBe(true);
    await settle();
    expect(ran).toEqual(['ssh host']);
    expect(pending).toEqual(['ls']);

    queue.setBusy(true);
    queue.setBusy(false);
    await settle();
    expect(ran).toEqual(['ssh host', 'ls']);
    expect(runner).toHaveBeenLastCalledWith('ls', true);
  });

  it('runs a line queued behind an application command once that command settles', async () => {
    const { queue, pending, ran } = makeQueue({ writesToShell: (line) => line !== 'help' });

    expect(queue.submit('help')).toBe(false);
    expect(queue.submit('ls')).toBe(true);
    await settle();

    expect(ran).toEqual(['help', 'ls']);
    expect(pending).toEqual([]);
  });

  it('queues a line while zsh is busy', () => {
    const { queue, pending } = makeQueue({ busy: true });

    expect(queue.submit('ls')).toBe(true);
    expect(pending).toEqual(['ls']);
  });

  it('wakes an idle shell to drain a line queued by another tab', async () => {
    const { queue, pending, ran, transport } = makeQueue();
    pending.push('ls -al');

    queue.wake();
    await settle();

    expect(ran).toEqual(['ls -al']);
    expect(transport.dequeue).toHaveBeenCalledTimes(1);
  });

  it('waits for the prompt when another tab queues a line while zsh is busy', async () => {
    const { queue, pending, ran } = makeQueue({ busy: true });
    pending.push('ls');

    queue.wake();
    await settle();

    expect(ran).toEqual([]);
    queue.setBusy(false);
    await settle();
    expect(ran).toEqual(['ls']);
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
