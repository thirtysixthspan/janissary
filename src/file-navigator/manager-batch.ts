import type { HistoryStep } from './moves.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult } from '../protocol.js';
import { LocalFileSystemPort, mapMaybe, type FileSystemPort, type MaybePromise } from './filesystem-port.js';
import type { RemoteTarget } from '../tab/types.js';
import { failureReasons } from './file-operation-result.js';

const localFilesystem = new LocalFileSystemPort();

type BatchState = {
  root: string;
  filesystem?: FileSystemPort;
  undoStack: HistoryStep[];
  redoStack: HistoryStep[];
  remote?: RemoteTarget;
};

function publicResult(result: BatchResult): BatchResult {
  return {
    total: result.total,
    failedPaths: result.failedPaths,
    ...(result.failureReasons && { failureReasons: result.failureReasons }),
  };
}

export function moveMany(
  state: BatchState,
  sourcePaths: string[],
  destinationPath: string,
  policy: BulkConflictPolicy | undefined,
  rebuild: () => void,
): MaybePromise<BulkMoveResult> {
  return mapMaybe((state.filesystem ?? localFilesystem).moveMany(state.root, sourcePaths, destinationPath, policy), (result) => {
    if ('conflictPaths' in result) return result;
    if (result.moved.length > 0) {
      state.undoStack.push({ entries: result.moved });
      state.redoStack = [];
    }
    if (result.mutated) rebuild();
    return publicResult(result);
  });
}

export function deleteMany(
  state: BatchState,
  sourcePaths: string[],
  rebuild: () => void,
): MaybePromise<BatchResult> {
  return mapMaybe((state.filesystem ?? localFilesystem).deleteMany(state.root, sourcePaths), (result) => {
    if (result.mutated) rebuild();
    return publicResult(result);
  });
}

export function pasteMany(
  state: BatchState,
  sources: string[],
  destinationPath: string,
  mode: 'copy' | 'cut',
  policy: BulkConflictPolicy | undefined,
  rebuild: () => void,
  sourceHost?: string,
): MaybePromise<BulkMoveResult> {
  if (sourceHost !== state.remote?.host) {
    const reason = 'Clipboard items are on a different host; copy and paste within one host.';
    return {
      total: sources.length, failedPaths: sources,
      ...failureReasons(new Map(sources.map((source) => [source, reason]))),
    };
  }
  return mapMaybe((state.filesystem ?? localFilesystem).paste(state.root, sources, destinationPath, mode, policy), (result) => {
    if ('conflictPaths' in result) return result;
    if (result.pairs.length > 0) {
      state.undoStack.push({ mode, pairs: result.pairs });
      state.redoStack = [];
    }
    if (result.mutated) rebuild();
    return publicResult(result);
  });
}
