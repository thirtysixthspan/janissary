import { describe, expect, it, vi } from 'vitest';
import type { RemoteChannel } from '../../remote/channel/index.js';
import type { NavigatorListener } from '../../remote/channel/types.js';
import type { ClientFrame } from '../../remote/protocol-frames.js';
import { RemoteFileSystemPort } from './port.js';

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

  it('commits through the git-commit operation with the message and its paths', async () => {
    const h = harness();
    const pending = h.port.commit('/remote/ws', 'commit: notes.txt', ['notes.txt']);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request')).toMatchObject({
      operation: 'git-commit', args: { message: 'commit: notes.txt', paths: ['notes.txt'] },
    });
    h.reply({ committed: true, summary: '1 file changed, 2 insertions(+)' });
    await expect(pending).resolves.toEqual({ committed: true, summary: '1 file changed, 2 insertions(+)' });
  });

  // The case that fails if the workspace mapping is skipped: a tree rooted below the workspace root
  // must send paths the far side can resolve against the *workspace*, not against the tree.
  it('maps a sub-rooted tree\'s paths onto the workspace before sending them', async () => {
    const h = harness();
    void h.port.commit('/remote/ws/src', 'commit: index.ts', ['app/index.ts']);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'git-commit', args: { paths: ['src/app/index.ts'] } });
  });

  it('sends an empty path list for the whole-tree form', async () => {
    const h = harness();
    void h.port.commit('/remote/ws', 'commit: 2 files', []);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'git-commit', args: { paths: [] } });
  });

  // The case that fails if the marker is skipped: a tree rooted below the workspace root must send
  // its own root, or the far side's single shared workspace root gets committed instead.
  it('sends the navigator root\'s workspace-relative prefix for a sub-rooted whole-tree commit', async () => {
    const h = harness();
    void h.port.commit('/remote/ws/src', 'commit: 2 files', []);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'git-commit', args: { paths: [], root: 'src' } });
  });

  it('sends a single move without an overwrite flag and maps a conflict answer back onto the tree', async () => {
    const h = harness();
    const pending = h.port.move('/remote/ws/src', 'a.txt', 'dest');
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    const request = h.sent.findLast((frame) => frame.type === 'filesystem-request');
    expect(request).toMatchObject({ operation: 'move', args: { from: 'src/a.txt', to: 'src/dest' } });
    expect(request?.type === 'filesystem-request' && Object.hasOwn(request.args, 'overwrite')).toBe(false);
    h.reply({ conflictPaths: ['src/a.txt'] });
    await expect(pending).resolves.toEqual({ conflictPaths: ['a.txt'] });
  });

  it('sends the overwrite flag on a confirmed single move and maps the moved path back', async () => {
    const h = harness();
    const pending = h.port.move('/remote/ws/src', 'a.txt', 'dest', true);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'move', args: { from: 'src/a.txt', to: 'src/dest', overwrite: true } });
    h.reply({ ok: true, value: { from: 'src/a.txt', to: 'src/dest/a.txt' } });
    await expect(pending).resolves.toEqual({ ok: true, value: { from: 'a.txt', to: 'dest/a.txt' } });
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

// The operations the suite above never reached. Same harness: a fake channel that records frames and
// hands replies back, so each case is about the frame the port sent and the value it answered with.
describe('RemoteFileSystemPort remaining operations', () => {
  const lastRequest = (sent: ClientFrame[]) => sent.findLast((frame) => frame.type === 'filesystem-request');

  it('sends a stat for the rows asked about', async () => {
    const h = harness();
    const pending = h.port.statRows('/remote/ws/src', ['a.ts', 'b.ts']);
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({
      operation: 'stat', args: { paths: ['src/a.ts', 'src/b.ts'] },
    });
    h.reply({ 'src/a.ts': { size: 1, modified: 2, mode: 3 } });
    await expect(pending).resolves.toEqual({ 'a.ts': { size: 1, modified: 2, mode: 3 }, 'b.ts': null });
  });

  // The read side of the base64 pair: content crosses the wire as base64 because the frame is JSON,
  // and comes back as the bytes the editor writes to disk.
  it('decodes a read file from its base64 payload', async () => {
    const h = harness();
    const pending = h.port.readFile('/remote/ws', 'notes.txt');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({ operation: 'read-file', args: { path: 'notes.txt' } });

    h.reply({ content: Buffer.from('héllo\n').toString('base64') });
    await expect(pending).resolves.toEqual(Buffer.from('héllo\n'));
  });

  it('sends a multi-item move with every source mapped', async () => {
    const h = harness();
    const pending = h.port.moveMany('/remote/ws/src', ['a.ts', 'b.ts'], 'dest', 'overwrite-all');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({
      operation: 'move-many',
      args: { sources: ['src/a.ts', 'src/b.ts'], destination: 'src/dest', policy: 'overwrite-all' },
    });
    h.reply({ total: 2, failedPaths: [], moved: [], mutated: false });
    await expect(pending).resolves.toMatchObject({ total: 2, mutated: false });
  });

  // A paste's sources are absolute, because a clipboard source can cross roots — so only the
  // destination is mapped, and mapping the sources would break the cross-root case entirely.
  it('maps only the paste destination, leaving the sources as they arrived', async () => {
    const h = harness();
    const pending = h.port.paste('/remote/ws/src', ['/elsewhere/a.txt'], 'dest', 'cut', 'skip-conflicts');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({
      operation: 'paste',
      args: { sources: ['/elsewhere/a.txt'], destination: 'src/dest', mode: 'cut', policy: 'skip-conflicts' },
    });
    h.reply({ total: 1, failedPaths: [], moved: [], mutated: false });
    await expect(pending).resolves.toMatchObject({ total: 1 });
  });

  // The far side names what it created against its own workspace, so the answer is mapped back onto
  // the tree before the caller sees it — otherwise the caller is handed a path it cannot open.
  it('maps a created file\'s path back onto the tree', async () => {
    const h = harness();
    const pending = h.port.createFile('/remote/ws/src', 'new.ts');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({
      operation: 'create-file', args: { destination: 'src/new.ts' },
    });
    h.reply({ ok: true, value: { path: 'src/new.ts' } });
    await expect(pending).resolves.toEqual({ ok: true, value: { path: 'new.ts' } });
  });

  it('maps a created directory\'s path back onto the tree', async () => {
    const h = harness();
    const pending = h.port.createDirectory('/remote/ws/src', 'sub');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({
      operation: 'create-directory', args: { destination: 'src/sub' },
    });
    h.reply({ ok: true, value: { path: 'src/sub' } });
    await expect(pending).resolves.toEqual({ ok: true, value: { path: 'sub' } });
  });

  // A refusal carries no path, so there is nothing to map: the answer is handed back exactly as the
  // far side wrote it.
  it('returns a create refusal as it stands, with no path to map', async () => {
    const h = harness();
    const pending = h.port.createFile('/remote/ws', 'a.ts');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    h.reply({ ok: false, reason: 'a file already holds that name' });
    await expect(pending).resolves.toEqual({ ok: false, reason: 'a file already holds that name' });
  });

  // The far side keeps watching while any listener remains on the path, so stopping one of two
  // handles must not tell it to stop — the other would go deaf with nothing to say so. Only the last
  // handle to stop takes the watch down.
  it('unwatches only when the last listener on a path stops', async () => {
    const h = harness();
    const first = h.port.watch('/remote/ws', 'src', vi.fn());
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    h.reply({});
    const firstHandle = await first;

    const second = h.port.watch('/remote/ws', 'src', vi.fn());
    await vi.waitFor(() => expect(h.sent.filter((f) => f.type === 'filesystem-request')).toHaveLength(2));
    h.reply({});
    const secondHandle = await second;

    firstHandle.stop();
    await Promise.resolve();
    expect(h.sent.some((f) => f.type === 'filesystem-request' && f.operation === 'unwatch')).toBe(false);

    secondHandle.stop();
    await vi.waitFor(() => expect(h.sent.filter((f) => f.type === 'filesystem-request'
      && f.operation === 'unwatch')).toHaveLength(1));
  });

  // A port disposed before its workspace ever resolved has nothing to open, and the operation is
  // reported rather than queued: the caller gets the same answer as any other closed port, and the
  // channel never sees a request it could not answer.
  it('reports operations as closed when disposed before the workspace resolved', async () => {
    const sent: ClientFrame[] = [];
    let listener: NavigatorListener | undefined;
    const channel = {
      attachNavigator: (_id: string, value: NavigatorListener) => { listener = value; },
      detachNavigator: vi.fn(),
      send: (frame: ClientFrame) => { sent.push(frame); },
    } as unknown as RemoteChannel;
    const { promise, resolve } = Promise.withResolvers<string>();
    const port = new RemoteFileSystemPort(channel, 'files-1', promise);

    port.dispose();
    resolve('/remote/ws');

    await expect(port.rename('/remote/ws', 'a.txt', 'b.txt'))
      .resolves.toMatchObject({ ok: false, reason: expect.stringContaining('closed') as string });
    expect(sent.some((frame) => frame.type === 'filesystem-open')).toBe(false);
    expect(listener).toBeDefined();
  });
});
