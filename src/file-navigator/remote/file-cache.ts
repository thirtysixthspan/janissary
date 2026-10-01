import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from '../batch-paths.js';
import type { FileSystemPort } from '../filesystem-port.js';

export type RemoteFileRecord = {
  filesystem: FileSystemPort;
  root: string;
  relPath: string;
  label: string;
};

let cacheRoot = '';
const records = new Map<string, RemoteFileRecord>();

function safeSegment(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

export function initRemoteFileCache(projectDirectory: string): void {
  cacheRoot = path.join(projectDirectory, '.janissary', 'remote-files');
}

export function materializeRemoteFile(
  host: string, workspaceLabel: string, relPath: string, content: Uint8Array, record: RemoteFileRecord,
): string {
  if (!cacheRoot) throw new Error('Remote file cache is not initialized.');
  const workspace = path.join(cacheRoot, safeSegment(host), safeSegment(workspaceLabel));
  const file = containedPath(workspace, relPath);
  if (!file) throw new Error('The path is outside the remote file cache.');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  records.set(path.resolve(file), record);
  return file;
}

// The navigator port a cached file writes back through. A record lives exactly as long as that
// port: once its navigator closes or is re-rooted, the record is forgotten, so a save can never be
// sent through a port that has already been disposed.
export function remoteFileFor(file: string): RemoteFileRecord | undefined {
  return records.get(path.resolve(file));
}

// Whether `file` is a cached copy of a remote file, whether or not the navigator it came from is
// still open — the cache holds nothing else. A cached copy with no record is orphaned: it has no
// route back to its remote, so it must not be saved or committed as if it were a local file.
export function isRemoteCacheFile(file: string): boolean {
  if (!cacheRoot) return false;
  return path.resolve(file).startsWith(`${path.resolve(cacheRoot)}${path.sep}`);
}

// Forget every cached file that writes back through `filesystem`, at the moment its navigator
// disposes it. The files themselves stay: an editor may still hold one open.
export function forgetRemoteFilesOf(filesystem: FileSystemPort): void {
  for (const [file, record] of records) if (record.filesystem === filesystem) records.delete(file);
}

export function clearRemoteFileCacheForWorkspace(host: string, workspaceLabel: string): void {
  if (!cacheRoot) return;
  const workspace = path.join(cacheRoot, safeSegment(host), safeSegment(workspaceLabel));
  try { rmSync(workspace, { recursive: true, force: true }); } catch { /* ignore */ }
  for (const [file] of records) if (file.startsWith(`${workspace}${path.sep}`)) records.delete(file);
}

export function clearRemoteFileCache(): void {
  if (!cacheRoot) return;
  try { rmSync(cacheRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  records.clear();
}
