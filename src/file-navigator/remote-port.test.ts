import { describe, expect, it, vi } from 'vitest';
import type { NavigatorListener, RemoteChannel } from '../remote/channel.js';
import type { ClientFrame } from '../remote/protocol.js';
import { RemoteFileSystemPort } from './remote-port.js';

function harness() {
  const sent: ClientFrame[] = [];
  let listener: NavigatorListener | undefined;
  const channel = {
    attachNavigator: (_id: string, value: NavigatorListener) => { listener = value; },
    detachNavigator: vi.fn(),
    send: (frame: ClientFrame) => { sent.push(frame); },
  } as unknown as RemoteChannel;
  const port = new RemoteFileSystemPort(channel, 'files-1', Promise.resolve('/remote/ws'));
  const reply = (result: unknown, error?: string) => {
    const request = sent.findLast((frame) => frame.type === 'filesystem-request');
    if (request?.type !== 'filesystem-request') throw new Error('No request was sent.');
    listener?.onReply({
      type: 'filesystem-reply', session: request.session, request: request.request,
      ...(error ? { error } : { result }),
    });
  };
  return { channel, port, sent, listener: () => listener, reply };
}

describe('RemoteFileSystemPort', () => {
  it('opens once, sends a request, and resolves its matching reply', async () => {
    const h = harness();
    const pending = h.port.readDirectory('/remote/ws', 'src');
    await vi.waitFor(() => expect(h.sent).toHaveLength(2));
    expect(h.sent[0]).toEqual({ type: 'filesystem-open', session: 'files-1' });
    expect(h.sent[1]).toMatchObject({
      type: 'filesystem-request', session: 'files-1', operation: 'read-directory', args: { path: 'src' },
    });
    h.reply([{ name: 'index.ts', dir: false }]);
    await expect(pending).resolves.toEqual([{ name: 'index.ts', dir: false }]);
  });

  it('round-trips binary file content through the base64 operation payload', async () => {
    const h = harness();
    const write = h.port.writeFile('/remote/ws', 'notes.txt', Buffer.from('héllo\n'));
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    const request = h.sent.findLast((frame) => frame.type === 'filesystem-request');
    expect(request).toMatchObject({ operation: 'write-file', args: { content: Buffer.from('héllo\n').toString('base64') } });
    h.reply({ ok: true });
    await expect(write).resolves.toEqual({ ok: true });
  });

  it('routes watch events and unwatches when the handle stops', async () => {
    const h = harness();
    const changed = vi.fn();
    const pending = h.port.watch('/remote/ws', 'src', changed);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    h.reply({});
    const handle = await pending;
    h.listener()?.onEvent('src');
    expect(changed).toHaveBeenCalledOnce();
    handle.stop();
    await vi.waitFor(() => expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'unwatch', args: { path: 'src' } }));
  });

  it('pulls through the git-pull operation with no path arguments', async () => {
    const h = harness();
    const pending = h.port.pull('/remote/ws');
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'git-pull', args: {} });
    h.reply('Already up to date.');
    await expect(pending).resolves.toBe('Already up to date.');
  });

  it('hands a refusal to the caller as a failure result rather than rejecting', async () => {
    const h = harness();
    const write = h.port.writeFile('/remote/ws', '../outside', Buffer.from(''));
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));

    h.reply({ ok: false, reason: 'The path is outside this file navigator; choose an item inside the tree' });

    await expect(write).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('outside this file navigator') });
  });

  it('hands a refused batch to the caller as a per-path failure report', async () => {
    const h = harness();
    const pending = h.port.deleteMany('/remote/ws', ['../outside']);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));

    h.reply({
      total: 1, failedPaths: ['../outside'], mutated: false,
      failureReasons: { '../outside': 'The path is outside this file navigator; choose an item inside the tree' },
    });

    await expect(pending).resolves.toMatchObject({
      total: 1, mutated: false,
      failureReasons: { '../outside': expect.stringContaining('outside this file navigator') },
    });
  });

  // A far-side failure on an operation whose result can express one is still that operation's own
  // failure value, not a transport error — rejecting reached the client as an RPC error with no
  // result at all, where a local tree answers with a report the navigator renders.
  it('reports an error reply as a failure value for an operation whose result carries one', async () => {
    const h = harness();
    const pending = h.port.writeFile('/remote/ws', 'notes.txt', Buffer.from(''));
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));

    h.reply(undefined, 'The remote file navigator session is not open.');

    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'The remote file navigator session is not open.' });
  });

  it('still rejects an error reply for an operation with nowhere to put a reason', async () => {
    const h = harness();
    const pending = h.port.readDirectory('/remote/ws', 'src');
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));

    h.reply(undefined, 'The remote file navigator session is not open.');

    await expect(pending).rejects.toThrow('session is not open');
  });

  it('rejects in-flight read-only work when the channel closes', async () => {
    const h = harness();
    const pending = h.port.search('/remote/ws');
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    h.listener()?.onClose?.();
    await expect(pending).rejects.toThrow('connection ended');
  });

  it('reports in-flight mutating work as a per-path failure when the channel closes', async () => {
    const h = harness();
    const pending = h.port.deleteMany('/remote/ws', ['a.txt', 'b.txt']);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));

    h.listener()?.onClose?.();

    await expect(pending).resolves.toMatchObject({
      total: 2, mutated: false, failedPaths: ['a.txt', 'b.txt'],
      failureReasons: { 'a.txt': expect.stringContaining('connection ended') as string },
    });
  });

  it('reports a request made after disposal without ever sending it', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.sent).toHaveLength(1));
    h.port.dispose();

    await expect(h.port.rename('/remote/ws', 'a.txt', 'b.txt'))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('closed') as string });
    // Reported without ever reaching the channel — the only frames sent are the open and the close.
    expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(false);
  });
});
