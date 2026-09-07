import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RemoteFileNavigators } from './serve-file-navigator.js';
import { RemoteFileSystemPort } from '../file-navigator/remote-port.js';
import { LocalFileSystemPort, type FileSystemPort } from '../file-navigator/filesystem-port.js';
import { deleteOne, moveOne, renameOne } from '../file-navigator/manager-item-operations.js';
import { deleteMany } from '../file-navigator/manager-batch.js';
import type { FilesTabState } from '../file-navigator/state.js';
import type { RemoteChannel, NavigatorListener } from './channel.js';
import type { ClientFrame } from './protocol.js';

// A remote port wired straight to a remote server over an in-memory channel, so the same call can
// be made against both implementations and their answers compared. The far side serves the same
// directory the local port reads, and the workspace is that directory, so an escaping path stays
// escaping in both vocabularies.
function loopback(root: string) {
  const listeners = new Map<string, NavigatorListener>();
  const sent: ClientFrame[] = [];
  // A channel that has gone away stops carrying frames; `stopDelivery` is how a test reaches the
  // state where a request is outstanding and no reply is ever coming.
  let delivering = true;
  const navigators = new RemoteFileNavigators((frame) => {
    if (frame.type !== 'filesystem-reply') return;
    listeners.get(frame.session)?.onReply(frame);
  }, root);
  const channel = {
    attachNavigator: (session: string, listener: NavigatorListener) => { listeners.set(session, listener); },
    detachNavigator: (session: string) => { listeners.delete(session); },
    send: (frame: ClientFrame) => {
      sent.push(frame);
      if (!delivering) return;
      if (frame.type === 'filesystem-open') { navigators.open(frame.session); return; }
      if (frame.type === 'filesystem-request') navigators.request(frame);
    },
  } as unknown as RemoteChannel;
  const port = new RemoteFileSystemPort(channel, 'files-1', Promise.resolve(root));
  return {
    port, sent,
    stopDelivery: () => { delivering = false; },
    dispose: () => { port.dispose(); navigators.dispose(); },
  };
}

function tabState(root: string, filesystem: FileSystemPort, remote: boolean): FilesTabState {
  return {
    root, filesystem,
    remote: remote ? { host: 'devbox', address: 'devbox:/srv/project' } : undefined,
    expanded: new Set(), watchers: new Map(), listings: new Map(),
    listingLoads: new Set(), statLoads: new Set(), stats: new Map(),
    undoStack: [], redoStack: [], details: 'name',
  };
}

describe('file navigator refusal contract', () => {
  let root: string;
  let remote: ReturnType<typeof loopback>;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-refusal-contract-'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    remote = loopback(root);
  });

  afterEach(() => {
    remote.dispose();
    rmSync(root, { recursive: true, force: true });
  });

  const managers = { tab: { retargetEditorTab: vi.fn() } } as never;

  // Runs one operation against a local tree and against the loopback remote tree, and returns both
  // answers. The point of every case below is that they match.
  async function bothTrees<T>(
    operation: (state: FilesTabState) => T | Promise<T>,
  ): Promise<{ local: T; remoteResult: T }> {
    const local = await operation(tabState(root, new LocalFileSystemPort(), false));
    const remoteResult = await operation(tabState(root, remote.port, true));
    return { local, remoteResult };
  }

  it('reports an out-of-tree rename the same way on a local and a remote tree', async () => {
    const { local, remoteResult } = await bothTrees((state) => renameOne(
      managers, state, '../outside.txt', 'renamed.txt', () => {},
    ));

    expect(remoteResult).toEqual(local);
    expect(remoteResult).toMatchObject({
      total: 1,
      failedPaths: ['../outside.txt'],
      failureReasons: { '../outside.txt': expect.stringContaining('outside this file navigator') },
    });
  });

  it('reports an out-of-tree move the same way on a local and a remote tree', async () => {
    const { local, remoteResult } = await bothTrees((state) => moveOne(
      state, '../outside.txt', '', () => {},
    ));

    expect(remoteResult).toEqual(local);
    expect(remoteResult).toMatchObject({
      failedPaths: ['../outside.txt'],
      failureReasons: { '../outside.txt': expect.stringContaining('outside this file navigator') },
    });
  });

  it('reports an out-of-tree delete the same way on a local and a remote tree', async () => {
    const { local, remoteResult } = await bothTrees((state) => deleteOne(
      state, '../outside.txt', () => {},
    ));

    expect(remoteResult).toEqual(local);
    expect(remoteResult).toMatchObject({
      failedPaths: ['../outside.txt'],
      failureReasons: { '../outside.txt': expect.stringContaining('outside this file navigator') },
    });
  });

  it('reports an out-of-tree batch delete as a per-path report on a remote tree', async () => {
    const state = tabState(root, remote.port, true);

    const result = await deleteMany(state, ['../outside.txt'], () => {});

    expect(result).toMatchObject({
      failedPaths: ['../outside.txt'],
      failureReasons: { '../outside.txt': expect.stringContaining('outside this file navigator') },
    });
  });

  it('leaves an in-tree operation working over the same channel', async () => {
    const state = tabState(root, remote.port, true);

    const result = await renameOne(managers, state, 'a.txt', 'b.txt', () => {});

    expect(result).toMatchObject({ total: 1, failedPaths: [] });
  });
});

// The contract above is about which answers match; this is about the port keeping to it when the
// channel does not answer at all. A rejection here reaches the client as an RPC error carrying no
// result, so a rename, a batch delete, or an undo replay that lost its connection looks as though
// nothing happened — for a destructive operation, the worst thing it could look like.
describe('file navigator contract when the channel ends mid-operation', () => {
  let root: string;
  let remote: ReturnType<typeof loopback>;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-refusal-ended-'));
    writeFileSync(path.join(root, 'a.txt'), 'a');
    remote = loopback(root);
  });

  afterEach(() => {
    remote.dispose();
    rmSync(root, { recursive: true, force: true });
  });

  const managers = { tab: { retargetEditorTab: vi.fn() } } as never;

  // Starts the operation with the channel no longer carrying frames, waits until the request is
  // genuinely outstanding, then ends the connection under it.
  async function whileEnding<T>(start: () => T | Promise<T>): Promise<T> {
    remote.stopDelivery();
    const pending = start();
    await vi.waitFor(() => expect(remote.sent.some((frame) => frame.type === 'filesystem-request')).toBe(true));
    remote.port.onClose();
    return pending;
  }

  it('reports a rename in flight as a per-path failure rather than rejecting', async () => {
    const state = tabState(root, remote.port, true);

    const result = await whileEnding(() => renameOne(managers, state, 'a.txt', 'b.txt', () => {}));

    expect(result).toMatchObject({
      total: 1,
      failedPaths: ['a.txt'],
      failureReasons: { 'a.txt': expect.stringContaining('connection ended') as string },
    });
  });

  it('reports a batch delete in flight as a per-path failure rather than rejecting', async () => {
    const state = tabState(root, remote.port, true);

    const result = await whileEnding(() => deleteMany(state, ['a.txt'], () => {}));

    expect(result).toMatchObject({
      failedPaths: ['a.txt'],
      failureReasons: { 'a.txt': expect.stringContaining('connection ended') as string },
    });
  });

  it('reports a replay in flight as a failure, leaving both history stacks as they were', async () => {
    const undoStack = [{ entries: [{ from: 'a.txt', to: 'b.txt' }] }];

    const result = await whileEnding(() => remote.port.replay(root, undoStack, [], 'undo', false, false));

    expect(result).toMatchObject({
      mutated: false,
      undoStack,
      redoStack: [],
      result: { failureReasons: { 'a.txt': expect.stringContaining('connection ended') as string } },
    });
  });

  it('still rejects a read whose result has nowhere to carry a reason', async () => {
    const pending = whileEnding(() => remote.port.search(root));

    await expect(pending).rejects.toThrow('connection ended');
  });
});
