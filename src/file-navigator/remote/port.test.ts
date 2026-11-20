import { describe, expect, it, vi } from 'vitest';
import type { RemoteChannel } from '../../remote/channel/index.js';
import type { NavigatorListener } from '../../remote/channel/types.js';
import type { ClientFrame } from '../../remote/protocol-frames.js';
import type { SearchMatch } from '../../protocol.js';
import type { FileGlobArgs } from '../../file-glob/command.js';
import type { FileGrepArgs } from '../../file-grep/command.js';
import { OUTSIDE_ROOT_REASON } from '../file-operation-result.js';
import { RemoteFileSystemPort } from './port.js';
import { CLOSED_REASON, ENDED_REASON, LONG_REQUEST_DEADLINE_MS, REQUEST_DEADLINE_MS, TIMED_OUT_REASON } from './port-requests.js';

function harness(ready: Promise<unknown> = Promise.resolve('/remote/ws')) {
  const sent: ClientFrame[] = [];
  let listener: NavigatorListener | undefined;
  const channel = {
    attachNavigator: (_id: string, value: NavigatorListener) => { listener = value; },
    detachNavigator: vi.fn(),
    send: (frame: ClientFrame) => { sent.push(frame); },
  } as unknown as RemoteChannel;
  const port = new RemoteFileSystemPort(channel, 'files-1', ready);
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

  it('forwards the optional expected hash and omits it for unconditional writes', async () => {
    const h = harness();
    const conditional = h.port.writeFile('/remote/ws', 'notes.txt', Buffer.from('new'), 'baseline');
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'write-file', args: { expectedHash: 'baseline' } });
    h.reply({ ok: true });
    await conditional;

    const overwrite = h.port.writeFile('/remote/ws', 'notes.txt', Buffer.from('overwrite'));
    await vi.waitFor(() => expect(h.sent.filter((frame) => frame.type === 'filesystem-request')).toHaveLength(2));
    const request = h.sent.findLast((frame) => frame.type === 'filesystem-request');
    expect(request?.type === 'filesystem-request' && Object.hasOwn(request.args, 'expectedHash')).toBe(false);
    h.reply({ ok: true });
    await overwrite;
  });

  it('forwards the tool-text policy only when supplied, with content as one base64 copy', async () => {
    const h = harness();
    const tool = h.port.writeFile('/remote/ws', 'notes.txt', Buffer.from('héllo'), undefined, 'tool-text');
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request')).toMatchObject({
      operation: 'write-file',
      args: { path: 'notes.txt', content: Buffer.from('héllo').toString('base64'), policy: 'tool-text' },
    });
    h.reply({ ok: true });
    await expect(tool).resolves.toEqual({ ok: true });

    const editor = h.port.writeFile('/remote/ws', 'notes.txt', Buffer.from('x'));
    await vi.waitFor(() => expect(h.sent.filter((frame) => frame.type === 'filesystem-request')).toHaveLength(2));
    const request = h.sent.findLast((frame) => frame.type === 'filesystem-request');
    expect(request?.type === 'filesystem-request' && request.args)
      .toEqual({ path: 'notes.txt', content: Buffer.from('x').toString('base64') });
    h.reply({ ok: true });
    await editor;
  });

  it('answers an absolute path under the tool policy locally and sends no frame', async () => {
    const h = harness();
    await expect(h.port.writeFile('/remote/ws', '/remote/ws/a.txt', Buffer.from('x'), undefined, 'tool-text'))
      .resolves.toEqual({ ok: false, reason: 'Outside the workspace' });
    expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(false);
  });

  it('still sends an absolute path without the tool policy', async () => {
    const h = harness();
    const pending = h.port.writeFile('/remote/ws', '/remote/ws/a.txt', Buffer.from('x'));
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    h.reply({ ok: true });
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it('resolves a policy write as a failure value on close, an error reply, and a timeout', async () => {
    const closed = harness();
    const onClose = closed.port.writeFile('/remote/ws', 'a.txt', Buffer.from('x'), undefined, 'tool-text');
    await vi.waitFor(() => expect(closed.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    closed.listener()?.onClose?.();
    await expect(onClose).resolves.toMatchObject({ ok: false });

    const ended = harness();
    const onError = ended.port.writeFile('/remote/ws', 'a.txt', Buffer.from('x'), undefined, 'tool-text');
    await vi.waitFor(() => expect(ended.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    ended.reply(undefined, 'Secret file');
    await expect(onError).resolves.toMatchObject({ ok: false });

    vi.useFakeTimers();
    try {
      const timed = harness();
      const onTimeout = timed.port.writeFile('/remote/ws', 'a.txt', Buffer.from('x'), undefined, 'tool-text');
      await vi.waitFor(() => expect(timed.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
      await vi.advanceTimersByTimeAsync(LONG_REQUEST_DEADLINE_MS + 1);
      await expect(onTimeout).resolves.toMatchObject({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends an edit with a plain mapped path, one base64 layer of text, and the replaceAll flag', async () => {
    const h = harness();
    const pending = h.port.editFile('/remote/ws/src', 'a.txt', 'héllo', 'wörld', true);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    const request = h.sent.findLast((frame) => frame.type === 'filesystem-request');
    expect(request).toMatchObject({ operation: 'edit-file' });
    const args = request?.type === 'filesystem-request' ? request.args as Record<string, unknown> : {};
    expect(args).toEqual({
      path: 'src/a.txt',
      oldString: Buffer.from('héllo', 'utf8').toString('base64'),
      newString: Buffer.from('wörld', 'utf8').toString('base64'),
      replaceAll: true,
    });
    expect(Buffer.from(String(args.oldString), 'base64').toString('utf8')).toBe('héllo');
    h.reply({ ok: true, value: { replacements: 2 } });
    await expect(pending).resolves.toEqual({ ok: true, value: { replacements: 2 } });
  });

  it('fails an edit whose reply reports zero replacements', async () => {
    const h = harness();
    const pending = h.port.editFile('/remote/ws', 'a.txt', 'x', 'y', false);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    h.reply({ ok: true, value: { replacements: 0 } });
    await expect(pending).rejects.toThrow('Invalid remote filesystem operation result.');
  });

  it('answers an absolute edit path locally and sends no frame', async () => {
    const h = harness();
    await expect(h.port.editFile('/remote/ws', '/remote/ws/a.txt', 'x', 'y', false))
      .resolves.toEqual({ ok: false, reason: 'Outside the workspace' });
    expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(false);
  });

  it('refuses lone-surrogate edit strings with the local reasons and sends no frame', async () => {
    const h = harness();
    await expect(h.port.editFile('/remote/ws', 'a.txt', '\u{D800}', 'y', false))
      .resolves.toEqual({ ok: false, reason: 'No matching text' });
    await expect(h.port.editFile('/remote/ws', 'a.txt', 'x', 'y\u{DFFF}', false))
      .resolves.toEqual({ ok: false, reason: 'Not a text file' });
    expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(false);
  });

  it('answers a root-escaping edit or tool write locally and sends no frame', async () => {
    const h = harness();
    await expect(h.port.editFile('/remote/ws/src', '../b.txt', 'x', 'y', false))
      .resolves.toEqual({ ok: false, reason: 'Outside the workspace' });
    await expect(h.port.writeFile('/remote/ws/src', '../b.txt', Buffer.from('x'), undefined, 'tool-text'))
      .resolves.toEqual({ ok: false, reason: 'Outside the workspace' });
    expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(false);
  });

  it('resolves an edit as a failure value on close, connection end, and timeout', async () => {
    const closed = harness();
    const onClose = closed.port.editFile('/remote/ws', 'a.txt', 'x', 'y', false);
    await vi.waitFor(() => expect(closed.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    closed.port.dispose();
    await expect(onClose).resolves.toEqual({ ok: false, reason: CLOSED_REASON });

    const dropped = harness();
    const onDrop = dropped.port.editFile('/remote/ws', 'a.txt', 'x', 'y', false);
    await vi.waitFor(() => expect(dropped.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    dropped.listener()?.onClose?.();
    await expect(onDrop).resolves.toEqual({ ok: false, reason: ENDED_REASON });

    const ended = harness();
    const onError = ended.port.editFile('/remote/ws', 'a.txt', 'x', 'y', false);
    await vi.waitFor(() => expect(ended.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    ended.reply(undefined, 'The remote connection ended.');
    await expect(onError).resolves.toEqual({ ok: false, reason: 'The remote connection ended.' });

    vi.useFakeTimers();
    try {
      const timed = harness();
      const onTimeout = timed.port.editFile('/remote/ws', 'a.txt', 'x', 'y', false);
      await vi.waitFor(() => expect(timed.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
      await vi.advanceTimersByTimeAsync(LONG_REQUEST_DEADLINE_MS + 1);
      await expect(onTimeout).resolves.toEqual({ ok: false, reason: 'The remote machine did not answer in time.' });
      timed.reply({ ok: true, value: { replacements: 1 } });
      await expect(onTimeout).resolves.toEqual({ ok: false, reason: 'The remote machine did not answer in time.' });
      expect(timed.sent.filter((frame) => frame.type === 'filesystem-request')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
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

  it('sends a search request without transferring candidate files', async () => {
    const h = harness();
    const request = { query: 'todo', include: 'src/**', exclude: '', regex: false, matchCase: false, wholeWord: false };
    const pending = h.port.searchText('/remote/ws/src', request);
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'search-text', args: { ...request, root: 'src' } });
    const result: SearchMatch[] = [{ path: 'src/a.ts', line: 1, above: [], match: 'todo', start: 0, end: 4, below: [] }];
    h.reply(result);
    await expect(pending).resolves.toEqual(result);
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
    h.reply({ total: 1, failedPaths: [], pairs: [], mutated: false });
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

  it('creates a file at the workspace root and maps its path back unchanged', async () => {
    const h = harness();
    const pending = h.port.createFile('/remote/ws', 'new.ts');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({
      operation: 'create-file', args: { destination: 'new.ts' },
    });
    h.reply({ ok: true, value: { path: 'new.ts' } });
    await expect(pending).resolves.toEqual({ ok: true, value: { path: 'new.ts' } });
  });

  it('creates a directory at the workspace root and maps its path back unchanged', async () => {
    const h = harness();
    const pending = h.port.createDirectory('/remote/ws', 'sub');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({
      operation: 'create-directory', args: { destination: 'sub' },
    });
    h.reply({ ok: true, value: { path: 'sub' } });
    await expect(pending).resolves.toEqual({ ok: true, value: { path: 'sub' } });
  });

  it('returns a directory-create refusal as it stands, with no path to map', async () => {
    const h = harness();
    const pending = h.port.createDirectory('/remote/ws/src', 'sub');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    h.reply({ ok: false, reason: 'a directory already holds that name' });
    await expect(pending).resolves.toEqual({ ok: false, reason: 'a directory already holds that name' });
  });

  it('reports an error reply to a creation as a failure value', async () => {
    const h = harness();
    const pending = h.port.createFile('/remote/ws', 'new.ts');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    h.reply(undefined, 'The remote file navigator session is not open.');
    await expect(pending).resolves.toEqual({
      ok: false, reason: 'The remote file navigator session is not open.',
    });
  });

  it('reports a creation requested after disposal without sending it', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.sent).toHaveLength(1));
    h.port.dispose();
    await expect(h.port.createFile('/remote/ws', 'new.ts'))
      .resolves.toEqual({ ok: false, reason: CLOSED_REASON });
    expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(false);
  });

  it('reports an in-flight creation as ended when the connection closes', async () => {
    const h = harness();
    const pending = h.port.createDirectory('/remote/ws/src', 'sub');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    h.listener()?.onClose?.();
    await expect(pending).resolves.toEqual({ ok: false, reason: ENDED_REASON });
  });

  it('settles a creation as unanswered after its deadline', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const pending = h.port.createFile('/remote/ws', 'new.ts');
      await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
      await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 1);
      await expect(pending).resolves.toEqual({ ok: false, reason: TIMED_OUT_REASON });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a creation whose successful reply carries no path', async () => {
    const h = harness();
    const pending = h.port.createDirectory('/remote/ws/src', 'sub');
    await vi.waitFor(() => expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(true));
    h.reply({ ok: true, value: {} });
    await expect(pending).rejects.toThrow('Invalid remote filesystem operation result.');
  });

  it('rejects a creation whose workspace cannot be resolved', async () => {
    const { promise, reject } = Promise.withResolvers<string>();
    const h = harness(promise);
    const pending = h.port.createFile('/remote/ws', 'new.ts');
    reject(new Error('The remote workspace is unavailable.'));
    h.port.dispose();
    await expect(pending).rejects.toThrow('The remote workspace is unavailable.');
    expect(h.sent.some((f) => f.type === 'filesystem-request')).toBe(false);
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

describe('RemoteFileSystemPort.readLines', () => {
  const hasRequest = (sent: ClientFrame[]) => sent.some((frame) => frame.type === 'filesystem-request');

  it('sends the mapped path with no offset or limit and resolves to the text and the sent path', async () => {
    const h = harness();
    const pending = h.port.readLines('/remote/ws', './notes/a.md');
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    const request = h.sent.findLast((frame) => frame.type === 'filesystem-request');
    expect(request).toMatchObject({ operation: 'read-lines', args: { path: 'notes/a.md' } });
    expect(request?.type === 'filesystem-request' && Object.keys(request.args)).toEqual(['path']);
    h.reply({ text: '1\thello' });
    await expect(pending).resolves.toEqual({ text: '1\thello', path: 'notes/a.md' });
  });

  it('forwards the offset and limit when given', async () => {
    const h = harness();
    const pending = h.port.readLines('/remote/ws', 'a.md', 3, 10);
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent.findLast((frame) => frame.type === 'filesystem-request'))
      .toMatchObject({ operation: 'read-lines', args: { path: 'a.md', offset: 3, limit: 10 } });
    h.reply({ text: '3\tthree' });
    await expect(pending).resolves.toEqual({ text: '3\tthree', path: 'a.md' });
  });

  it('answers an absolute path as outside the workspace without sending a request', async () => {
    const h = harness();
    await expect(h.port.readLines('/remote/ws', '/remote/ws/a.md'))
      .resolves.toEqual({ text: 'Outside the workspace: /remote/ws/a.md.', path: '/remote/ws/a.md' });
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-open')).toBe(true));
    expect(hasRequest(h.sent)).toBe(false);
  });

  it('rejects with the unavailable reason when the channel was not attached', async () => {
    const h = harness();
    const pending = h.port.readLines('/remote/ws', 'a.md');
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    h.reply(undefined, 'Remote connection unavailable.');
    await expect(pending).rejects.toThrow(new Error('Remote connection unavailable.'));
  });

  it('rejects with the outside-root reason when the far side refuses the path', async () => {
    const h = harness();
    const pending = h.port.readLines('/remote/ws', '../x');
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    h.reply(undefined, OUTSIDE_ROOT_REASON);
    await expect(pending).rejects.toThrow(new Error(OUTSIDE_ROOT_REASON));
  });

  it('rejects in-flight work when the channel closes', async () => {
    const h = harness();
    const pending = h.port.readLines('/remote/ws', 'a.md');
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    h.listener()?.onClose?.();
    await expect(pending).rejects.toThrow('connection ended');
  });
});

describe('RemoteFileSystemPort.globPaths', () => {
  const hasRequest = (sent: ClientFrame[]) => sent.some((frame) => frame.type === 'filesystem-request');
  const lastRequest = (sent: ClientFrame[]) => sent.findLast((frame) => frame.type === 'filesystem-request');
  const args = (overrides: Partial<FileGlobArgs> = {}): FileGlobArgs => ({
    pattern: '**/*.ts', dir: undefined, hidden: false, dirs: false, limit: 100, ...overrides,
  });

  it('sends only the pattern and limit when no path or flags are given', async () => {
    const h = harness();
    const pending = h.port.globPaths('/remote/ws', args());
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    const request = lastRequest(h.sent);
    expect(request).toMatchObject({ operation: 'glob-paths', args: { pattern: '**/*.ts', limit: 100 } });
    expect(request?.type === 'filesystem-request' && Object.keys(request.args)).toEqual(['pattern', 'limit']);
    h.reply({ text: 'a.ts' });
    await expect(pending).resolves.toEqual({ text: 'a.ts', dir: undefined });
  });

  it('sends the mapped path and resolves with it', async () => {
    const h = harness();
    const pending = h.port.globPaths('/remote/ws', args({ dir: './src/' }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({ operation: 'glob-paths', args: { dir: 'src' } });
    h.reply({ text: 'src/a.ts' });
    await expect(pending).resolves.toEqual({ text: 'src/a.ts', dir: 'src' });
  });

  it.each(['.', 'src/..'])('sends an empty dir for %s, which names the root', async (dir) => {
    const h = harness();
    const pending = h.port.globPaths('/remote/ws', args({ dir }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    const request = lastRequest(h.sent);
    expect(request?.type === 'filesystem-request' && request.args).toHaveProperty('dir', '');
    h.reply({ text: 'a.ts' });
    await expect(pending).resolves.toEqual({ text: 'a.ts', dir: '' });
  });

  it('answers an absolute path as outside the workspace without sending a request', async () => {
    const h = harness();
    await expect(h.port.globPaths('/remote/ws', args({ dir: '/remote/ws/src' })))
      .resolves.toEqual({ text: 'Outside the workspace: /remote/ws/src.', dir: '/remote/ws/src' });
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-open')).toBe(true));
    expect(hasRequest(h.sent)).toBe(false);
  });

  it('sends the hidden and dirs flags as true when set', async () => {
    const h = harness();
    const pending = h.port.globPaths('/remote/ws', args({ hidden: true, dirs: true }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({ operation: 'glob-paths', args: { hidden: true, dirs: true } });
    h.reply({ text: '.config' });
    await expect(pending).resolves.toEqual({ text: '.config', dir: undefined });
  });

  it('sends an escaping path as is and rejects with the outside-root reason', async () => {
    const h = harness();
    const pending = h.port.globPaths('/remote/ws', args({ dir: '../x' }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({ operation: 'glob-paths', args: { dir: '../x' } });
    h.reply(undefined, OUTSIDE_ROOT_REASON);
    await expect(pending).rejects.toThrow(new Error(OUTSIDE_ROOT_REASON));
  });
});

describe('RemoteFileSystemPort.grepFiles', () => {
  const hasRequest = (sent: ClientFrame[]) => sent.some((frame) => frame.type === 'filesystem-request');
  const defaults = {
    pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
  };
  const args = (overrides: Partial<FileGrepArgs> = {}): FileGrepArgs => ({
    ...defaults, path: undefined, ...overrides,
  });
  const frame = (wireArgs: Record<string, unknown>) => ({
    type: 'filesystem-request' as const, session: 'files-1', request: 'files-1:1', operation: 'grep-files' as const,
    args: wireArgs,
  });

  it('omits an undefined path and resolves with an own undefined path property', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args());
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame(defaults)]);
    h.reply({ text: '(no matches)' });
    const result = await pending;
    expect(result).toEqual({ text: '(no matches)', path: undefined });
    expect(Object.hasOwn(result, 'path')).toBe(true);
  });

  it('sends every default false or empty required field', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args());
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame(defaults)]);
    h.reply({ text: '(no matches)' });
    await expect(pending).resolves.toEqual({ text: '(no matches)', path: undefined });
  });

  it('sends an explicit empty path as the root', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args({ path: '' }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame({ ...defaults, path: '' })]);
    h.reply({ text: 'a.ts:1: TODO' });
    await expect(pending).resolves.toEqual({ text: 'a.ts:1: TODO', path: '' });
  });

  it.each(['.', 'src/..'])('maps %s to the root', async (spelling) => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args({ path: spelling }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame({ ...defaults, path: '' })]);
    h.reply({ text: '(no matches)' });
    await expect(pending).resolves.toEqual({ text: '(no matches)', path: '' });
  });

  it('normalizes ./src/ to src', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args({ path: './src/' }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame({ ...defaults, path: 'src' })]);
    h.reply({ text: 'src/a.ts:1: TODO' });
    await expect(pending).resolves.toEqual({ text: 'src/a.ts:1: TODO', path: 'src' });
  });

  it('maps a dot at a nested root to that directory', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws/sub', args({ path: '.' }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame({ ...defaults, path: 'sub' })]);
    h.reply({ text: 'sub/a.ts:1: TODO' });
    await expect(pending).resolves.toEqual({ text: 'sub/a.ts:1: TODO', path: 'sub' });
  });

  it('forwards every nondefault field', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args({
      pattern: 'a.*b', include: '*.ts', exclude: '*.test.ts', literal: true, word: true, caseSensitive: true,
      limit: 7, path: './src/',
    }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame({
      pattern: 'a.*b', include: '*.ts', exclude: '*.test.ts', literal: true, word: true, caseSensitive: true,
      path: 'src', limit: 7,
    })]);
    h.reply({ text: 'src/a.ts:4: aXb' });
    await expect(pending).resolves.toEqual({ text: 'src/a.ts:4: aXb', path: 'src' });
  });

  it('returns formatted rows and partial-result trailers unchanged', async () => {
    const h = harness();
    const text = 'src/a.ts:9: export const FILE_READ_USAGE = …\n(src/a.ts:10: another)\n(showing the first 2 matches; narrow the pattern or raise --limit)';
    const pending = h.port.grepFiles('/remote/ws', args());
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame(defaults)]);
    h.reply({ text });
    await expect(pending).resolves.toEqual({ text, path: undefined });
  });

  it.each(['/remote/ws/src', '/etc'])('answers the absolute path %s without a request', async (absolute) => {
    const h = harness();
    await expect(h.port.grepFiles('/remote/ws', args({ path: absolute })))
      .resolves.toEqual({ text: `Outside the workspace: ${absolute}.`, path: absolute });
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-open')).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }]);
    expect(hasRequest(h.sent)).toBe(false);
  });

  it('answers an absolute path before an unresolved workspace readiness', async () => {
    const { promise, resolve } = Promise.withResolvers<string>();
    const h = harness(promise);
    await expect(h.port.grepFiles('/remote/ws', args({ path: '/remote/ws/src' })))
      .resolves.toEqual({ text: 'Outside the workspace: /remote/ws/src.', path: '/remote/ws/src' });
    expect(h.sent).toEqual([]);
    h.port.dispose();
    resolve('/remote/ws');
  });

  it('rejects with the outside-root reason when the far side refuses the path', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args({ path: '../x' }));
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame({ ...defaults, path: '../x' })]);
    const assertion = expect(pending).rejects.toThrow(new Error(OUTSIDE_ROOT_REASON));
    h.reply(undefined, OUTSIDE_ROOT_REASON);
    await assertion;
  });

  it('rejects with a generic far-side error', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args());
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame(defaults)]);
    const assertion = expect(pending).rejects.toThrow('boom');
    h.reply(undefined, 'boom');
    await assertion;
  });

  it('rejects in-flight work when the channel closes', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args());
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame(defaults)]);
    const assertion = expect(pending).rejects.toThrow('connection ended');
    h.listener()?.onClose?.();
    await assertion;
  });

  it('rejects after the ordinary 60-second request deadline', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const pending = h.port.grepFiles('/remote/ws', args());
      await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
      expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame(defaults)]);
      const assertion = expect(pending).rejects.toThrow(TIMED_OUT_REASON);
      await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a malformed successful reply', async () => {
    const h = harness();
    const pending = h.port.grepFiles('/remote/ws', args());
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(h.sent).toEqual([{ type: 'filesystem-open', session: 'files-1' }, frame(defaults)]);
    const assertion = expect(pending).rejects.toThrow('Invalid remote filesystem operation result.');
    h.reply({ text: 7 });
    await assertion;
  });

  it('rejects when the workspace readiness rejects while mapping the path', async () => {
    const { promise, reject } = Promise.withResolvers<string>();
    const h = harness(promise);
    const pending = h.port.grepFiles('/remote/ws', args({ path: 'src' }));
    const failure = new Error('The remote workspace is unavailable.');
    const assertion = expect(pending).rejects.toBe(failure);
    reject(failure);
    h.port.dispose();
    await assertion;
    expect(h.sent).toEqual([]);
  });
});

describe('RemoteFileSystemPort.webSearch', () => {
  const hasRequest = (sent: ClientFrame[]) => sent.some((frame) => frame.type === 'filesystem-request');
  const lastRequest = (sent: ClientFrame[]) => sent.findLast((frame) => frame.type === 'filesystem-request');
  const command = {
    query: 'vitest 2026', numResults: 5, maxChars: 2000, depth: 'advanced', provider: 'tavily',
  } as const;

  it('sends exactly the five command fields and resolves to the reply text', async () => {
    const h = harness();
    const args = { ...command, extra: 'ignored' };
    const pending = h.port.webSearch(args);
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    const request = lastRequest(h.sent);
    expect(request).toMatchObject({ operation: 'web-search', args: command });
    expect(request?.type === 'filesystem-request' && Object.keys(request.args))
      .toEqual(['query', 'numResults', 'maxChars', 'depth', 'provider']);
    h.reply({ text: '1. [Vitest](https://vitest.dev)' });
    await expect(pending).resolves.toBe('1. [Vitest](https://vitest.dev)');
  });

  it('rejects in-flight work when the channel closes', async () => {
    const h = harness();
    const pending = h.port.webSearch(command);
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    h.listener()?.onClose?.();
    await expect(pending).rejects.toThrow(new Error(ENDED_REASON));
  });

  it('reports a request made after disposal without ever sending it', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.sent).toHaveLength(1));
    h.port.dispose();

    await expect(h.port.webSearch(command)).rejects.toThrow(new Error(CLOSED_REASON));
    expect(hasRequest(h.sent)).toBe(false);
  });
});

describe('RemoteFileSystemPort.webFetch', () => {
  const hasRequest = (sent: ClientFrame[]) => sent.some((frame) => frame.type === 'filesystem-request');
  const lastRequest = (sent: ClientFrame[]) => sent.findLast((frame) => frame.type === 'filesystem-request');
  const command = {
    url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto',
  } as const;

  it('sends exactly the six fields and resolves to the reply text', async () => {
    const h = harness();
    const args = { ...command, extra: 'ignored' };
    const pending = h.port.webFetch(args);
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    const request = lastRequest(h.sent);
    expect(request).toMatchObject({ operation: 'web-fetch', args: command });
    expect(request?.type === 'filesystem-request' && Object.keys(request.args))
      .toEqual(['url', 'format', 'timeoutSeconds', 'maxChars', 'offset', 'provider']);
    h.reply({ text: 'Fetched https://example.com/page (local).' });
    await expect(pending).resolves.toBe('Fetched https://example.com/page (local).');
  });

  it('rejects in-flight work when the channel closes', async () => {
    const h = harness();
    const pending = h.port.webFetch(command);
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    h.listener()?.onClose?.();
    await expect(pending).rejects.toThrow(new Error(ENDED_REASON));
  });

  it('reports a request made after disposal without ever sending it', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.sent).toHaveLength(1));
    h.port.dispose();

    await expect(h.port.webFetch(command)).rejects.toThrow(new Error(CLOSED_REASON));
    expect(hasRequest(h.sent)).toBe(false);
  });

  it('waits for the long deadline', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const pending = h.port.webFetch(command);
      let settled = false;
      const observe = (async () => {
        try {
          await pending;
        } catch {
          // The rejection is asserted below.
        }
        settled = true;
      })();
      await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
      await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 1);
      expect(settled).toBe(false);
      const rejection = expect(pending).rejects.toThrow(TIMED_OUT_REASON);
      await vi.advanceTimersByTimeAsync(LONG_REQUEST_DEADLINE_MS - REQUEST_DEADLINE_MS);
      await rejection;
      await observe;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a far-side error reply with its message unchanged', async () => {
    const h = harness();
    const pending = h.port.webFetch(command);
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    const assertion = expect(pending).rejects.toThrow(new Error('Web fetch: boom.'));
    h.reply(undefined, 'Web fetch: boom.');
    await assertion;
  });
});

describe('RemoteFileSystemPort.applyPatch', () => {
  const lastRequest = (sent: ClientFrame[]) => sent.findLast((frame) => frame.type === 'filesystem-request');
  const patchText = '*** Begin Patch\n*** Add File: ../x.md\n+héllo\n*** End Patch';

  it('sends one apply-patch frame carrying the whole patch as base64 UTF-8', async () => {
    const h = harness();
    const pending = h.port.applyPatch('/remote/ws', patchText);
    await vi.waitFor(() => expect(lastRequest(h.sent)).toBeDefined());
    expect(h.sent.filter((frame) => frame.type === 'filesystem-request')).toHaveLength(1);
    const request = lastRequest(h.sent);
    expect(request).toMatchObject({ type: 'filesystem-request', session: 'files-1', operation: 'apply-patch' });
    const args = request?.type === 'filesystem-request' ? request.args as Record<string, unknown> : {};
    expect(Object.keys(args)).toEqual(['patchText']);
    expect(Buffer.from(String(args.patchText), 'base64').toString('utf8')).toBe(patchText);
    h.reply({ text: 'Patched 1 file:\nA a.md' });
    await pending;
  });

  it('resolves to the reply\'s text unchanged', async () => {
    const h = harness();
    const pending = h.port.applyPatch('/remote/ws', patchText);
    await vi.waitFor(() => expect(lastRequest(h.sent)).toBeDefined());
    h.reply({ text: 'Patched 1 file:\nA a.md' });
    await expect(pending).resolves.toBe('Patched 1 file:\nA a.md');
  });

  it('rejects in flight with the closed reason on dispose and the ended reason on close', async () => {
    const disposed = harness();
    const onDispose = disposed.port.applyPatch('/remote/ws', patchText);
    await vi.waitFor(() => expect(lastRequest(disposed.sent)).toBeDefined());
    disposed.port.dispose();
    await expect(onDispose).rejects.toThrow(CLOSED_REASON);

    const ended = harness();
    const onEnd = ended.port.applyPatch('/remote/ws', patchText);
    await vi.waitFor(() => expect(lastRequest(ended.sent)).toBeDefined());
    ended.listener()?.onClose?.();
    await expect(onEnd).rejects.toThrow(ENDED_REASON);
  });

  it('rejects with the closed reason without sending a frame when called after disposal', async () => {
    const h = harness();
    await vi.waitFor(() => expect(h.sent).toHaveLength(1));
    h.port.dispose();
    await expect(h.port.applyPatch('/remote/ws', patchText)).rejects.toThrow(CLOSED_REASON);
    expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(false);
  });

  it('rejects as unanswered only after the long deadline', async () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      const pending = h.port.applyPatch('/remote/ws', patchText);
      await vi.waitFor(() => expect(lastRequest(h.sent)).toBeDefined());
      const assertion = expect(pending).rejects.toThrow(TIMED_OUT_REASON);
      let settled = false;
      void pending.catch(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS + 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(LONG_REQUEST_DEADLINE_MS - REQUEST_DEADLINE_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with the far side\'s message on an error reply', async () => {
    const h = harness();
    const pending = h.port.applyPatch('/remote/ws', patchText);
    await vi.waitFor(() => expect(lastRequest(h.sent)).toBeDefined());
    h.reply(undefined, 'boom');
    await expect(pending).rejects.toThrow('boom');
  });

  it('rejects a reply whose output text is empty', async () => {
    const h = harness();
    const pending = h.port.applyPatch('/remote/ws', patchText);
    await vi.waitFor(() => expect(lastRequest(h.sent)).toBeDefined());
    h.reply({ text: '' });
    await expect(pending).rejects.toThrow('Invalid remote filesystem operation result.');
  });

  it('refuses lone-surrogate patch text without sending a frame', async () => {
    const h = harness();
    await expect(h.port.applyPatch('/remote/ws', '\u{D800}')).rejects.toThrow(new Error('Not a text file'));
    await vi.waitFor(() => expect(h.sent.some((frame) => frame.type === 'filesystem-open')).toBe(true));
    expect(h.sent.some((frame) => frame.type === 'filesystem-request')).toBe(false);
  });
});

describe('RemoteFileSystemPort typed read methods', () => {
  const hasRequest = (sent: ClientFrame[]) => sent.some((frame) => frame.type === 'filesystem-request');
  const lastRequest = (sent: ClientFrame[]) => sent.findLast((frame) => frame.type === 'filesystem-request');
  const text = 'finished remote wording';

  it.each([
    ['listDirectory', 'list-directory'],
    ['statPath', 'stat-path'],
    ['pathExists', 'path-exists'],
  ] as const)('%s maps the path, forwards it and returns the decoded text', async (method, operation) => {
    const h = harness();
    const pending = h.port[method]('/remote/ws', './notes/a.md');
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({ operation, args: { path: 'notes/a.md' } });
    h.reply({ text });
    await expect(pending).resolves.toEqual({ text, path: 'notes/a.md' });
  });

  it.each([
    ['headLines', 'head-lines'],
    ['tailLines', 'tail-lines'],
  ] as const)('%s forwards the line count and returns the decoded text', async (method, operation) => {
    const h = harness();
    const pending = h.port[method]('/remote/ws', './notes/a.md', 7);
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    expect(lastRequest(h.sent)).toMatchObject({ operation, args: { path: 'notes/a.md', count: 7 } });
    h.reply({ text });
    await expect(pending).resolves.toEqual({ text, path: 'notes/a.md' });
  });

  it.each(['listDirectory', 'statPath', 'pathExists'] as const)('%s refuses an absolute path without a request', async (method) => {
    const h = harness();
    await expect(h.port[method]('/remote/ws', '/remote/ws/a.md'))
      .resolves.toEqual({ text: 'forbidden', path: '/remote/ws/a.md' });
    expect(hasRequest(h.sent)).toBe(false);
  });

  it.each(['headLines', 'tailLines'] as const)('%s refuses an absolute path without a request', async (method) => {
    const h = harness();
    await expect(h.port[method]('/remote/ws', '/remote/ws/a.md', 7))
      .resolves.toEqual({ text: 'Outside the workspace: /remote/ws/a.md.', path: '/remote/ws/a.md' });
    expect(hasRequest(h.sent)).toBe(false);
  });

  it('surfaces a channel refusal as a rejection, like the line read', async () => {
    const h = harness();
    const pending = h.port.listDirectory('/remote/ws', '../x');
    await vi.waitFor(() => expect(hasRequest(h.sent)).toBe(true));
    h.reply(undefined, 'Remote connection unavailable.');
    await expect(pending).rejects.toThrow(new Error('Remote connection unavailable.'));
  });
});
