import type { BulkConflictPolicy } from '../../protocol.js';
import type { RemoteChannel } from '../../remote/channel/index.js';
import type { NavigatorListener } from '../../remote/channel/types.js';
import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from '../../remote/protocol-frames.js';
import type { DeleteManyResult, MoveManyResult } from '../batch.js';
import type { FileOperationResult } from '../file-operation-result.js';
import type { MoveOneResult } from '../filesystem.js';
import type {
  FileSystemPort, GitMetadata, ReplayResult, WatchHandle,
} from '../filesystem-port.js';
import type { FileNavigatorEntry } from '../index.js';
import type { PasteManyResult } from '../paste.js';
import type { RowStat } from '../stats.js';
import type { HistoryStep } from '../moves.js';
import { remoteGitCommit, remoteGitMetadata, remoteGitPull, type RemoteRequest } from './port-git.js';
import { remoteMove, remoteMoveMany } from './port-moves.js';
import { remoteDeleteMany, remoteReplay, remoteSearch, remoteStatRows } from './port-mapped.js';
import type { CommitResult } from '../../git/commit.js';
import { RemotePortPaths, resolveRemoteWorkspace } from './port-paths.js';
import {
  CLOSED_REASON, ENDED_REASON, RemotePortRequests, unavailableResult,
} from './port-requests.js';
import { RemotePortWatchers } from './port-watchers.js';

export class RemoteFileSystemPort implements FileSystemPort, NavigatorListener {
  private requestNumber = 0;
  private requests = new RemotePortRequests();
  private watchers = new RemotePortWatchers();
  private closed = false;
  private opened: Promise<void>;
  private workspace: Promise<string>;
  private paths: RemotePortPaths;

  constructor(
    private channel: RemoteChannel,
    private session: string,
    ready: Promise<unknown> = Promise.resolve(),
  ) {
    channel.attachNavigator(session, this);
    this.workspace = resolveRemoteWorkspace(ready);
    this.paths = new RemotePortPaths(this.workspace);
    this.opened = this.openSession();
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    void this.closeSession();
    this.channel.detachNavigator(this.session);
    this.requests.failAll(CLOSED_REASON);
    this.watchers.clear();
  }

  onReply(frame: Parameters<NavigatorListener['onReply']>[0]): void {
    this.requests.answer(frame.request, frame.result, frame.error);
  }

  onEvent(path: string): void {
    this.watchers.emit(path);
  }

  onClose(): void {
    this.closed = true;
    this.requests.failAll(ENDED_REASON);
    this.watchers.clear();
  }

  async readDirectory(root: string, relPath: string): Promise<FileNavigatorEntry[]> {
    return this.request('read-directory', { path: await this.paths.to(root, relPath) });
  }

  async statRows(root: string, paths: string[]): Promise<Record<string, RowStat | null>> {
    return remoteStatRows(this.requester(), this.paths, root, paths);
  }

  async watch(root: string, relPath: string, onChange: () => void): Promise<WatchHandle> {
    const path = await this.paths.to(root, relPath);
    await this.request('watch', { path });
    this.watchers.listen(path, onChange);
    return { stop: () => { void this.unwatch(path, onChange); } };
  }

  gitMetadata(root: string, onResult: (metadata: GitMetadata) => void): void {
    remoteGitMetadata(this.requester(), this.paths, root, onResult);
  }

  // `_root` exists only to keep the port signature uniform with `gitMetadata`'s — the far side pulls
  // its own workspace root, so there is nothing to map.
  pull(_root: string): Promise<string> { return remoteGitPull(this.requester()); }

  commit(root: string, message: string, relPaths: string[]): Promise<CommitResult> {
    return remoteGitCommit(this.requester(), this.paths, root, message, relPaths);
  }

  async search(root: string): Promise<string[]> {
    return remoteSearch(this.requester(), this.paths, root);
  }

  async readFile(root: string, relPath: string): Promise<Uint8Array> {
    const result = await this.request<{ content: string }>('read-file', { path: await this.paths.to(root, relPath) });
    return Buffer.from(result.content, 'base64');
  }

  async writeFile(root: string, relPath: string, content: Uint8Array): Promise<FileOperationResult> {
    return this.request('write-file', {
      path: await this.paths.to(root, relPath), content: Buffer.from(content).toString('base64'),
    });
  }

  move(root: string, from: string, to: string, overwrite?: boolean): Promise<MoveOneResult> {
    return remoteMove(this.requester(), this.paths, root, from, to, overwrite);
  }

  moveMany(root: string, sources: string[], destination: string, policy?: BulkConflictPolicy): Promise<MoveManyResult> {
    return remoteMoveMany(this.requester(), this.paths, root, sources, destination, policy);
  }

  async delete(root: string, relPath: string): Promise<FileOperationResult> {
    return this.request('delete', { path: await this.paths.to(root, relPath) });
  }

  deleteMany(root: string, paths: string[]): Promise<DeleteManyResult> {
    return remoteDeleteMany(this.requester(), this.paths, root, paths);
  }

  async rename(root: string, relPath: string, name: string): Promise<FileOperationResult<[string, string]>> {
    return this.request('rename', { path: await this.paths.to(root, relPath), name });
  }

  paste(
    root: string, sources: string[], destination: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy,
  ): Promise<PasteManyResult> {
    return this.pasteRemote(root, sources, destination, mode, policy);
  }

  async createFile(root: string, destination: string): Promise<FileOperationResult<{ path: string }>> {
    return this.createItem(root, destination, 'create-file');
  }

  async createDirectory(root: string, destination: string): Promise<FileOperationResult<{ path: string }>> {
    return this.createItem(root, destination, 'create-directory');
  }

  replay(
    root: string, undoStack: HistoryStep[], redoStack: HistoryStep[], direction: 'undo' | 'redo',
    overwrite: boolean, skipConflicts: boolean,
  ): Promise<ReplayResult> {
    return remoteReplay(this.requester(), this.paths, root, undoStack, redoStack, direction, overwrite, skipConflicts);
  }

  private async unwatch(path: string, listener: () => void): Promise<void> {
    if (!this.watchers.forget(path, listener)) return;
    try { await this.request('unwatch', { path }); } catch { /* teardown is best effort */ }
  }

  // `request` as a plain value, for the git and move operations that live in `remote-port-git.ts`
  // and `remote-port-moves.ts`: they need to send frames without learning anything about this
  // port's session bookkeeping.
  private requester(): RemoteRequest {
    return (operation, args) => this.request(operation, args);
  }

  private async request<T>(operation: RemoteFilesystemOperation, args: RemoteFilesystemArguments): Promise<T> {
    try {
      await this.opened;
    } catch {
      return unavailableResult<T>(operation, args, CLOSED_REASON);
    }
    if (this.closed) return unavailableResult<T>(operation, args, CLOSED_REASON);
    const request = `${this.session}:${++this.requestNumber}`;
    return new Promise<T>((resolve, reject) => {
      this.requests.add(request, { operation, args, resolve: (value) => resolve(value as T), reject });
      this.channel.send({ type: 'filesystem-request', session: this.session, request, operation, args });
    });
  }

  private async pasteRemote(
    root: string, sources: string[], destination: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy,
  ): Promise<PasteManyResult> {
    return this.request('paste', {
      sources, destination: await this.paths.to(root, destination), mode, policy,
    });
  }

  private async createItem(
    root: string, destination: string, operation: 'create-file' | 'create-directory',
  ): Promise<FileOperationResult<{ path: string }>> {
    const result = await this.request<FileOperationResult<{ path: string }>>(
      operation, { destination: await this.paths.to(root, destination) },
    );
    if (!result.ok) return result;
    return { ok: true, value: { path: await this.paths.from(root, result.value.path) } };
  }

  private async openSession(): Promise<void> {
    await this.workspace;
    if (this.closed) throw new Error(CLOSED_REASON);
    this.channel.send({ type: 'filesystem-open', session: this.session });
  }

  private async closeSession(): Promise<void> {
    try {
      await this.opened;
      this.channel.send({ type: 'filesystem-close', session: this.session });
    } catch { /* a session that never opened needs no close frame */ }
  }
}
