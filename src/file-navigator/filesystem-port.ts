import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import path from 'node:path';
import { changedPaths, currentBranch, remoteUrl, type GitFileStatus } from '../git-status.js';
import { githubCommitsUrl } from '../github-url.js';
import { nextFreeName } from '../editor/next-free-name.js';
import { readDirSorted, type FileNavigatorEntry } from './index.js';
import { containedPath, realDirectory } from './batch-paths.js';
import { deleteBatch, moveBatch, type DeleteManyResult, type MoveManyResult } from './batch.js';
import { deleteItem, moveItem, renameItem } from './filesystem.js';
import { listProjectFiles } from './search.js';
import { readRowStat, type RowStat } from './stats.js';
import { pasteBatch, type PasteManyResult } from './paste.js';
import { failureResult, OUTSIDE_ROOT_REASON, runFileOperation, type FileOperationResult } from './file-operation-result.js';
import type { BulkConflictPolicy } from '../protocol.js';
import type { UndoRedoResult } from '../protocol.js';
import type { HistoryStep } from './moves.js';
import { replayHistory } from './manager-history.js';

export type MaybePromise<T> = T | Promise<T>;
export function mapMaybe<T, Result>(value: MaybePromise<T>, map: (item: T) => Result): MaybePromise<Result> {
  return value instanceof Promise ? mapPromise(value, map) : map(value);
}

async function mapPromise<T, Result>(value: Promise<T>, map: (item: T) => Result): Promise<Result> {
  return map(await value);
}
export type WatchHandle = { stop: () => void };
export type GitMetadata = {
  statuses: [string, GitFileStatus][];
  branch?: string;
  githubUrl?: string;
};
export type ReplayResult = {
  result: UndoRedoResult;
  undoStack: HistoryStep[];
  redoStack: HistoryStep[];
  mutated: boolean;
};

export interface FileSystemPort {
  dispose(): void;
  readDirectory(root: string, relPath: string): MaybePromise<FileNavigatorEntry[]>;
  statRows(root: string, relPaths: string[]): MaybePromise<Record<string, RowStat | null>>;
  watch(root: string, relPath: string, onChange: () => void): MaybePromise<WatchHandle>;
  gitMetadata(root: string, onResult: (metadata: GitMetadata) => void): void;
  search(root: string): Promise<string[]>;
  readFile(root: string, relPath: string): Promise<Uint8Array>;
  writeFile(root: string, relPath: string, content: Uint8Array): MaybePromise<FileOperationResult>;
  move(root: string, fromRelPath: string, toRelPath: string): MaybePromise<FileOperationResult<{ from: string; to: string }>>;
  moveMany(root: string, sources: string[], destination: string, policy?: BulkConflictPolicy): MaybePromise<MoveManyResult>;
  delete(root: string, relPath: string): MaybePromise<FileOperationResult>;
  deleteMany(root: string, paths: string[]): MaybePromise<DeleteManyResult>;
  rename(root: string, relPath: string, newName: string): MaybePromise<FileOperationResult<[string, string]>>;
  paste(root: string, sources: string[], destination: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy): MaybePromise<PasteManyResult>;
  createFile(root: string, destination: string): MaybePromise<FileOperationResult<{ path: string }>>;
  createDirectory(root: string, destination: string): MaybePromise<FileOperationResult<{ path: string }>>;
  replay(
    root: string, undoStack: HistoryStep[], redoStack: HistoryStep[], direction: 'undo' | 'redo',
    overwrite: boolean, skipConflicts: boolean,
  ): MaybePromise<ReplayResult>;
}

function absoluteDirectory(root: string, relPath: string): string | undefined {
  return relPath === '' ? path.resolve(root) : containedPath(root, relPath);
}

export class LocalFileSystemPort implements FileSystemPort {
  dispose(): void {}
  readDirectory(root: string, relPath: string): FileNavigatorEntry[] {
    const directory = absoluteDirectory(root, relPath);
    return directory ? readDirSorted(directory) : [];
  }

  statRows(root: string, relPaths: string[]): Record<string, RowStat | null> {
    return Object.fromEntries(relPaths.map((relPath) => [relPath, readRowStat(path.join(root, relPath))]));
  }

  watch(root: string, relPath: string, onChange: () => void): WatchHandle {
    const directory = absoluteDirectory(root, relPath);
    if (!directory) return { stop: () => {} };
    try {
      const watcher = watch(directory, onChange);
      return { stop: () => { try { watcher.close(); } catch { /* already gone */ } } };
    } catch {
      return { stop: () => {} };
    }
  }

  gitMetadata(root: string, onResult: (metadata: GitMetadata) => void): void {
    void this.loadGitMetadata(root, onResult);
  }

  private async loadGitMetadata(root: string, onResult: (metadata: GitMetadata) => void): Promise<void> {
    const [statuses, branch, remote] = await Promise.all([
      changedPaths(root), currentBranch(root), remoteUrl(root),
    ]);
    onResult({
      statuses: [...statuses], branch,
      githubUrl: remote && branch ? githubCommitsUrl(remote, branch) : undefined,
    });
  }

  search(root: string): Promise<string[]> { return listProjectFiles(root); }

  async readFile(root: string, relPath: string): Promise<Uint8Array> {
    const absolute = containedPath(root, relPath);
    if (!absolute) throw new Error(OUTSIDE_ROOT_REASON);
    return readFileSync(absolute);
  }

  writeFile(root: string, relPath: string, content: Uint8Array): FileOperationResult {
    const absolute = containedPath(root, relPath);
    return absolute ? runFileOperation(() => writeFileSync(absolute, content)) : failureResult(OUTSIDE_ROOT_REASON);
  }

  move(root: string, from: string, to: string) { return moveItem(root, from, to); }
  moveMany(root: string, sources: string[], destination: string, policy?: BulkConflictPolicy) {
    return moveBatch(root, sources, destination, policy);
  }
  delete(root: string, relPath: string) { return deleteItem(root, relPath); }
  deleteMany(root: string, paths: string[]) { return deleteBatch(root, paths); }
  rename(root: string, relPath: string, newName: string) { return renameItem(root, relPath, newName); }
  paste(root: string, sources: string[], destination: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy) {
    return pasteBatch(root, sources, destination, mode, policy);
  }

  createFile(root: string, destination: string): FileOperationResult<{ path: string }> {
    const directory = realDirectory(root, destination);
    if (!directory) return failureResult(OUTSIDE_ROOT_REASON);
    const name = nextFreeName(directory, 'untitled.md');
    return { ok: true, value: { path: destination ? `${destination}/${name}` : name } };
  }

  createDirectory(root: string, destination: string): FileOperationResult<{ path: string }> {
    const directory = realDirectory(root, destination);
    if (!directory) return failureResult(OUTSIDE_ROOT_REASON);
    const name = nextFreeName(directory, 'untitled');
    return runFileOperation(() => {
      mkdirSync(path.join(directory, name));
      return { path: destination ? `${destination}/${name}` : name };
    });
  }

  replay(
    root: string, undoStack: HistoryStep[], redoStack: HistoryStep[], direction: 'undo' | 'redo',
    overwrite: boolean, skipConflicts: boolean,
  ): ReplayResult {
    const state = { root, undoStack: structuredClone(undoStack), redoStack: structuredClone(redoStack) };
    let mutated = false;
    const result = replayHistory(state, direction, overwrite, skipConflicts, () => { mutated = true; });
    if (result instanceof Promise) throw new Error('Local history replay unexpectedly became asynchronous.');
    return { result, undoStack: state.undoStack, redoStack: state.redoStack, mutated };
  }
}
