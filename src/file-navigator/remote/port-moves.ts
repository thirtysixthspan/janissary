import type { BulkConflictPolicy } from '../../protocol.js';
import type { MoveManyResult } from '../batch.js';
import type { MoveOneResult } from '../filesystem.js';
import type { RemoteRequest } from './port-git.js';
import type { RemotePortPaths } from './port-paths.js';

// `RemoteFileSystemPort`'s two move operations, extracted so that file stays under the size limit —
// the same split `remote-port-git.ts` uses. Both take the port's bound request sender and its path
// mapper as parameters, so nothing here knows about the port's session bookkeeping. The far side
// answers with workspace-relative paths, including in a conflict report, so every path it names is
// mapped back onto the tree's root before the answer leaves here.

async function fromRemote(paths: RemotePortPaths, root: string, remotePaths: string[]): Promise<string[]> {
  return Promise.all(remotePaths.map((item) => paths.from(root, item)));
}

// `overwrite` crosses the wire only when set, so a plain move carries exactly the arguments it
// always did and the far side refuses an occupied destination rather than replacing it.
export async function remoteMove(
  request: RemoteRequest, paths: RemotePortPaths,
  root: string, from: string, to: string, overwrite?: boolean,
): Promise<MoveOneResult> {
  const result = await request<MoveOneResult>('move', {
    from: await paths.to(root, from), to: await paths.to(root, to), ...(overwrite && { overwrite }),
  });
  if ('conflictPaths' in result) return { conflictPaths: await fromRemote(paths, root, result.conflictPaths) };
  if (!result.ok) return result;
  return { ok: true, value: { from, to: await paths.from(root, result.value.to) } };
}

export async function remoteMoveMany(
  request: RemoteRequest, paths: RemotePortPaths,
  root: string, sources: string[], destination: string, policy?: BulkConflictPolicy,
): Promise<MoveManyResult> {
  const result = await request<MoveManyResult>('move-many', {
    sources: await Promise.all(sources.map((item) => paths.to(root, item))),
    destination: await paths.to(root, destination), policy,
  });
  if ('conflictPaths' in result) return { conflictPaths: await fromRemote(paths, root, result.conflictPaths) };
  return {
    ...result,
    failedPaths: await fromRemote(paths, root, result.failedPaths),
    moved: await Promise.all(result.moved.map(async (item) => ({
      from: await paths.from(root, item.from), to: await paths.from(root, item.to),
    }))),
  };
}
