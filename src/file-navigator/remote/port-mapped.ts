import type { DeleteManyResult } from '../batch.js';
import type { ReplayResult } from '../filesystem-port.js';
import type { HistoryStep } from '../moves.js';
import type { RemoteRequest } from './port-git.js';
import { mapRemoteHistory } from './port-history.js';
import type { RemotePortPaths } from './port-paths.js';
import type { RowStat } from '../stats.js';

// `RemoteFileSystemPort`'s path-mapping operations, extracted on the same split as
// `remote-port-git.ts` and `remote-port-moves.ts`: each takes the port's bound request sender and its
// path mapper as parameters rather than reaching for them, so nothing here knows about the port's
// session bookkeeping. What the four share is that the far side speaks workspace-relative paths, so
// every path an operation names — in its arguments and in its answer — crosses the mapper here.

// One status per path asked about, `null` for a path that is not there, keyed by the path the caller
// asked with rather than the one the far side named it by.
export async function remoteStatRows(
  request: RemoteRequest, paths: RemotePortPaths, root: string, items: string[],
): Promise<Record<string, RowStat | null>> {
  const remotePaths = await Promise.all(items.map((item) => paths.to(root, item)));
  const result = await request<Record<string, RowStat | null>>('stat', { paths: remotePaths });
  return Object.fromEntries(items.map((item, index) => [item, result[remotePaths[index]] ?? null]));
}

// A search names no path: the far side searches the workspace root it provisioned, and answers with
// the matches relative to it.
export async function remoteSearch(
  request: RemoteRequest, paths: RemotePortPaths, root: string,
): Promise<string[]> {
  return paths.filterMatches(root, await request<string[]>('search', {}));
}

// The paths a delete-many failed on are the caller's, not the far side's.
export async function remoteDeleteMany(
  request: RemoteRequest, paths: RemotePortPaths, root: string, items: string[],
): Promise<DeleteManyResult> {
  const result = await request<DeleteManyResult>(
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
  const result = await request<ReplayResult>('replay', {
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
