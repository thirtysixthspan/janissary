import path from 'node:path';
import type { RemoteRequest } from './port-git.js';
import type { RemotePortPaths } from './port-paths.js';

// `RemoteFileSystemPort`'s line read, extracted so that file stays under the size limit — the same
// split `port-moves.ts` uses. It takes the port's bound request sender and its path mapper as
// parameters, so nothing here knows about the port's session bookkeeping.

// An absolute path is answered here, before anything waits on the workspace or the session: the
// path mapper would turn one inside the remote workspace into a relative path and read it, while
// the local reader refuses every absolute path. Answering with the reader's own line keeps both
// tabs saying the same thing. `path` is the spelling actually sent, so a caller can tell when the
// mapping changed what the user typed.
export async function remoteReadLines(
  request: RemoteRequest, paths: RemotePortPaths,
  root: string, relPath: string, offset?: number, limit?: number,
): Promise<{ text: string; path: string }> {
  if (path.posix.isAbsolute(relPath)) return { text: `Outside the workspace: ${relPath}.`, path: relPath };
  const sent = await paths.to(root, relPath);
  const result = await request('read-lines', {
    path: sent,
    ...(offset !== undefined && { offset }),
    ...(limit !== undefined && { limit }),
  });
  return { text: result.text, path: sent };
}
