import type { DeleteManyResult } from '../batch.js';
import type { FileOperationResult } from '../file-operation-result.js';
import type { ReplayResult } from '../filesystem-port.js';
import type { HistoryStep } from '../moves.js';
import type { RemoteRequest } from './port-git.js';
import { mapRemoteHistory } from './port-history.js';
import type { RemotePortPaths } from './port-paths.js';
import type { RowStat } from '../stats.js';
import type { BulkConflictPolicy } from '../../protocol.js';
import type { PasteManyResult } from '../paste.js';

// `RemoteFileSystemPort`'s path-mapping operations, extracted on the same split as
// `port-git.ts` and `port-moves.ts`: each takes the port's bound request sender and its
// path mapper as parameters rather than reaching for them, so nothing here knows about the port's
// session bookkeeping. What they share is that the far side speaks workspace-relative paths, so
// every path an operation names — in its arguments and in its answer — crosses the mapper here.

// One status per path asked about, `null` for a path that is not there, keyed by the path the caller
// asked with rather than the one the far side named it by.
export async function remoteStatRows(
  request: RemoteRequest, paths: RemotePortPaths, root: string, items: string[],
): Promise<Record<string, RowStat | null>> {
  const remotePaths = await Promise.all(items.map((item) => paths.to(root, item)));
  const result = await request('stat', { paths: remotePaths });
  return Object.fromEntries(items.map((item, index) => [item, result[remotePaths[index]] ?? null]));
}

// A search names no path: the far side searches the workspace root it provisioned, and answers with
// the matches relative to it.
export async function remoteSearch(
  request: RemoteRequest, paths: RemotePortPaths, root: string,
): Promise<string[]> {
  return paths.filterMatches(root, await request('search', {}));
}

// The paths a delete-many failed on are the caller's, not the far side's.
export async function remoteDeleteMany(
  request: RemoteRequest, paths: RemotePortPaths, root: string, items: string[],
): Promise<DeleteManyResult> {
  const result = await request(
    'delete-many', { paths: await Promise.all(items.map((item) => paths.to(root, item))) },
  );
  return { ...result, failedPaths: await Promise.all(result.failedPaths.map((item) => paths.from(root, item))) };
}

// A replay names every step of both stacks and answers with the stacks as they stand afterwards, so
// both histories cross the mapper, out and back.
export async function remoteReplay(
  request: RemoteRequest, paths: RemotePortPaths, root: string,
  undoStack: HistoryStep[], redoStack: HistoryStep[], direction: 'undo' | 'redo',
  overwrite: boolean, skipConflicts: boolean,
): Promise<ReplayResult> {
  const result = await request('replay', {
    undoStack: await mapRemoteHistory(undoStack, (item) => paths.to(root, item)),
    redoStack: await mapRemoteHistory(redoStack, (item) => paths.to(root, item)),
    direction, overwrite, skipConflicts,
  });
  return {
    ...result,
    undoStack: await mapRemoteHistory(result.undoStack, (item) => paths.from(root, item)),
    redoStack: await mapRemoteHistory(result.redoStack, (item) => paths.from(root, item)),
  };
}

// The created path is the far side's, so a successful answer is mapped back onto the tree; a refusal
// names nothing, so it is handed back exactly as the far side wrote it.
export async function remoteCreateItem(
  request: RemoteRequest, paths: RemotePortPaths, root: string, destination: string,
  operation: 'create-file' | 'create-directory',
): Promise<FileOperationResult<{ path: string }>> {
  const remoteDestination = await paths.to(root, destination);
  const result = operation === 'create-file'
    ? await request('create-file', { destination: remoteDestination })
    : await request('create-directory', { destination: remoteDestination });
  if (!result.ok) return result;
  return { ok: true, value: { path: await paths.from(root, result.value.path) } };
}

// Only the destination is mapped: a clipboard source is absolute and can cross roots, so it travels as
// it arrived, and so do `mode` and `policy`.
export async function remotePaste(
  request: RemoteRequest, paths: RemotePortPaths, root: string,
  sources: string[], destination: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy,
): Promise<PasteManyResult> {
  return request('paste', { sources, destination: await paths.to(root, destination), mode, policy });
}
