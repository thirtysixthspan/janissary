import path from 'node:path';
import { containedPath } from '../file-navigator/batch-paths.js';
import { errorText } from '../error-text.js';
import {
  LocalFileSystemPort,
  type FileSystemPort,
  type WatchHandle,
} from '../file-navigator/filesystem-port.js';
import type { MaybePromise } from '../maybe-promise.js';
import { refusalFor, refusedPaths } from './filesystem-refusal.js';
import { operationDescriptor, type OperationContext } from './filesystem-operations.js';
import { OUTSIDE_ROOT_REASON } from '../file-navigator/file-operation-result.js';
import type { ClientFrame, RemoteFilesystemArguments, ServerFrame } from './protocol.js';

type RequestFrame = Extract<ClientFrame, { type: 'filesystem-request' }>;

export class RemoteFileNavigators {
  private sessions = new Map<string, Map<string, WatchHandle>>();

  constructor(
    private emit: (frame: ServerFrame) => void,
    private root: string,
    private filesystem: FileSystemPort = new LocalFileSystemPort(),
  ) {}

  open(session: string): void {
    if (!this.sessions.has(session)) this.sessions.set(session, new Map());
  }

  close(session: string): void {
    const watchers = this.sessions.get(session);
    if (!watchers) return;
    for (const watcher of watchers.values()) watcher.stop();
    this.sessions.delete(session);
  }

  request(frame: RequestFrame): void {
    if (!this.sessions.has(frame.session)) {
      this.reply(frame, undefined, 'The remote file navigator session is not open.');
      return;
    }
    if (this.refuse(frame)) return;
    try {
      const result = this.dispatch(frame);
      void Promise.resolve(result).then(
        (value) => this.reply(frame, value),
        (error: unknown) => this.reply(frame, undefined, errorText(error)),
      );
    } catch (error) {
      this.reply(frame, undefined, errorText(error));
    }
  }

  dispose(): void {
    for (const session of this.sessions.keys()) this.close(session);
  }

  private dispatch(frame: RequestFrame): MaybePromise<unknown> {
    return operationDescriptor(frame.operation).run(this.context(frame.session), frame.args);
  }

  // The session-scoped half of what an operation runs against, bound per request: the watcher map
  // and the emit callback stay private to this class, and the operation table stays plain data.
  private context(session: string): OperationContext {
    return {
      root: this.root,
      filesystem: this.filesystem,
      watch: (relPath) => this.watch(session, relPath),
      unwatch: (relPath) => this.unwatch(session, relPath),
      git: () => this.git(),
      readFile: (relPath) => this.readFile(relPath),
      pasteSources: (args) => this.pasteSources(args),
    };
  }

  private watch(session: string, relPath: string): MaybePromise<Record<string, never>> {
    const watchers = this.sessions.get(session);
    if (!watchers || watchers.has(relPath)) return {};
    const result = this.filesystem.watch(this.root, relPath, () => {
      this.emit({ type: 'filesystem-event', session, path: relPath });
    });
    if (result instanceof Promise) {
      return this.storeWatcher(result, watchers, relPath);
    }
    watchers.set(relPath, result);
    return {};
  }

  private async storeWatcher(
    pending: Promise<WatchHandle>, watchers: Map<string, WatchHandle>, relPath: string,
  ): Promise<Record<string, never>> {
    watchers.set(relPath, await pending);
    return {};
  }

  private unwatch(session: string, relPath: string): Record<string, never> {
    const watchers = this.sessions.get(session);
    watchers?.get(relPath)?.stop();
    watchers?.delete(relPath);
    return {};
  }

  private git(): Promise<unknown> {
    return new Promise((resolve) => { this.filesystem.gitMetadata(this.root, resolve); });
  }

  private async readFile(relPath: string): Promise<{ content: string }> {
    const content = await this.filesystem.readFile(this.root, relPath);
    return { content: Buffer.from(content).toString('base64') };
  }

  private pasteSources(args: RemoteFilesystemArguments): string[] {
    return (args.sources ?? []).map((source) => {
      const relative = path.isAbsolute(source) ? path.relative(this.root, source) : source;
      const absolute = containedPath(this.root, relative);
      if (!absolute) throw new Error('The path is outside this file navigator; choose an item inside the tree');
      return absolute;
    });
  }

  // The workspace-containment gate: a request naming any path outside the root runs nothing at all.
  // Answers in the operation's own result shape when that shape can carry a reason, so the client
  // reports the refusal the way it reports a local one, and falls back to an error reply for the
  // operations whose result has nowhere to put it. Returns whether the request was refused.
  private refuse(frame: RequestFrame): boolean {
    if (refusedPaths(frame, this.root).length === 0) return false;
    const refusal = refusalFor(frame);
    if (refusal.classified) this.reply(frame, refusal.value);
    else this.reply(frame, undefined, OUTSIDE_ROOT_REASON);
    return true;
  }

  private reply(frame: RequestFrame, result?: unknown, error?: string): void {
    this.emit(error === undefined
      ? { type: 'filesystem-reply', session: frame.session, request: frame.request, result }
      : { type: 'filesystem-reply', session: frame.session, request: frame.request, error });
  }
}
