import path from 'node:path';
import type { RemoteRequest } from './port-git.js';
import type { RemotePortPaths } from './port-paths.js';
import { failureResult, type FileOperationResult } from '../file-operation-result.js';
import type { FileWritePolicy } from '../../file-write/types.js';

// `RemoteFileSystemPort`'s line read and write, extracted so that file stays under the size limit — the same
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

// Content crosses as one base64 copy. Under the tool policy an absolute path is refused here with the
// local tool branch's own reason, for the same mapping reason as the line read above; an editor save
// keeps mapping and sending it.
export async function remoteWriteFile(
  request: RemoteRequest, paths: RemotePortPaths, root: string, relPath: string,
  content: Uint8Array, expectedHash?: string, policy?: FileWritePolicy,
): Promise<FileOperationResult> {
  if (policy !== undefined && path.posix.isAbsolute(relPath)) return failureResult('Outside the workspace');
  return request('write-file', {
    path: await paths.to(root, relPath), content: Buffer.from(content).toString('base64'),
    ...(expectedHash !== undefined && { expectedHash }),
    ...(policy !== undefined && { policy }),
  });
}
