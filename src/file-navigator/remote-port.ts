import type { BulkConflictPolicy } from '../protocol.js';
import type { RemoteChannel, NavigatorListener } from '../remote/channel.js';
import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from '../remote/protocol.js';
import type { DeleteManyResult, MoveManyResult } from './batch.js';
import type { FileOperationResult } from './file-operation-result.js';
import type {
  FileSystemPort, GitMetadata, ReplayResult, WatchHandle,
} from './filesystem-port.js';
import type { FileNavigatorEntry } from './index.js';
import type { PasteManyResult } from './paste.js';
import type { RowStat } from './stats.js';
import type { HistoryStep } from './moves.js';
import { mapRemoteHistory } from './remote-port-history.js';
import { RemotePortPaths, resolveRemoteWorkspace } from './remote-port-paths.js';
import { RemotePortWatchers } from './remote-port-watchers.js';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export class RemoteFileSystemPort implements FileSystemPort, NavigatorListener {
  private requestNumber = 0;
  private pending = new Map<string, Pending>();
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
    this.rejectPending('The remote file navigator is closed.');
    this.watchers.clear();
  }

  onReply(frame: Parameters<NavigatorListener['onReply']>[0]): void {
    const pending = this.pending.get(frame.request);
    if (!pending) return;
    this.pending.delete(frame.request);
    if (frame.error === undefined) { pending.resolve(frame.result); return; }
    pending.reject(new Error(frame.error));
  }

  onEvent(path: string): void {
    this.watchers.emit(path);
  }

  onClose(): void {
    this.closed = true;
    this.rejectPending('The remote connection ended.');
    this.watchers.clear();
  }

  async readDirectory(root: string, relPath: string): Promise<FileNavigatorEntry[]> {
    return this.request('read-directory', { path: await this.paths.to(root, relPath) });
  }

  async statRows(root: string, paths: string[]): Promise<Record<string, RowStat | null>> {
    const remotePaths = await Promise.all(paths.map((item) => this.paths.to(root, item)));
    const result = await this.request<Record<string, RowStat | null>>('stat', { paths: remotePaths });
    return Object.fromEntries(paths.map((item, index) => [item, result[remotePaths[index]] ?? null]));
  }

  async watch(root: string, relPath: string, onChange: () => void): Promise<WatchHandle> {
    const path = await this.paths.to(root, relPath);
    await this.request('watch', { path });
    this.watchers.listen(path, onChange);
    return { stop: () => { void this.unwatch(path, onChange); } };
  }

  gitMetadata(root: string, onResult: (metadata: GitMetadata) => void): void {
    void this.request<GitMetadata>('git', {}).then(async (metadata) => {
      onResult({ ...metadata, statuses: await this.paths.filterEntries(root, metadata.statuses) });
    }, () => onResult({ statuses: [] }));
  }

  // `git-pull` carries no path arguments: the far side pulls its own workspace root, so `_root`
  // exists only to keep the port signature uniform with `gitMetadata`'s.
  pull(_root: string): Promise<void> { return this.request('git-pull', {}); }

  async search(root: string): Promise<string[]> {
    const matches = await this.request<string[]>('search', {});
    return this.paths.filterMatches(root, matches);
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

  async move(root: string, from: string, to: string): Promise<FileOperationResult<{ from: string; to: string }>> {
    const result = await this.request<FileOperationResult<{ from: string; to: string }>>(
      'move', { from: await this.paths.to(root, from), to: await this.paths.to(root, to) },
    );
    if (!result.ok) return result;
    return { ok: true, value: { from, to: await this.paths.from(root, result.value.to) } };
  }

  async moveMany(root: string, sources: string[], destination: string, policy?: BulkConflictPolicy): Promise<MoveManyResult> {
    const result = await this.request<MoveManyResult>('move-many', {
      sources: await Promise.all(sources.map((item) => this.paths.to(root, item))),
      destination: await this.paths.to(root, destination), policy,
    });
    if ('conflictPaths' in result) {
      return { conflictPaths: await Promise.all(result.conflictPaths.map((item) => this.paths.from(root, item))) };
    }
    return {
      ...result,
      failedPaths: await Promise.all(result.failedPaths.map((item) => this.paths.from(root, item))),
      moved: await Promise.all(result.moved.map(async (item) => ({
        from: await this.paths.from(root, item.from), to: await this.paths.from(root, item.to),
      }))),
    };
  }

  async delete(root: string, relPath: string): Promise<FileOperationResult> {
    return this.request('delete', { path: await this.paths.to(root, relPath) });
  }

  async deleteMany(root: string, paths: string[]): Promise<DeleteManyResult> {
    const result = await this.request<DeleteManyResult>(
      'delete-many', { paths: await Promise.all(paths.map((item) => this.paths.to(root, item))) },
    );
    return { ...result, failedPaths: await Promise.all(result.failedPaths.map((item) => this.paths.from(root, item))) };
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

  async replay(
    root: string, undoStack: HistoryStep[], redoStack: HistoryStep[], direction: 'undo' | 'redo',
    overwrite: boolean, skipConflicts: boolean,
  ): Promise<ReplayResult> {
    const result = await this.request<ReplayResult>('replay', {
      undoStack: await mapRemoteHistory(undoStack, (item) => this.paths.to(root, item)),
      redoStack: await mapRemoteHistory(redoStack, (item) => this.paths.to(root, item)),
      direction, overwrite, skipConflicts,
    });
    return {
      ...result,
      undoStack: await mapRemoteHistory(result.undoStack, (item) => this.paths.from(root, item)),
      redoStack: await mapRemoteHistory(result.redoStack, (item) => this.paths.from(root, item)),
    };
  }

  private async unwatch(path: string, listener: () => void): Promise<void> {
    if (!this.watchers.forget(path, listener)) return;
    try { await this.request('unwatch', { path }); } catch { /* teardown is best effort */ }
  }

  private async request<T>(operation: RemoteFilesystemOperation, args: RemoteFilesystemArguments): Promise<T> {
    await this.opened;
    if (this.closed) throw new Error('The remote file navigator is closed.');
    const request = `${this.session}:${++this.requestNumber}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(request, { resolve: (value) => resolve(value as T), reject });
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

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) pending.reject(new Error(message));
    this.pending.clear();
  }

  private async openSession(): Promise<void> {
    await this.workspace;
    if (this.closed) throw new Error('The remote file navigator is closed.');
    this.channel.send({ type: 'filesystem-open', session: this.session });
  }

  private async closeSession(): Promise<void> {
    try {
      await this.opened;
      this.channel.send({ type: 'filesystem-close', session: this.session });
    } catch { /* a session that never opened needs no close frame */ }
  }
}
