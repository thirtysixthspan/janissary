import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { containedPath } from './batch-paths.js';
import type { FileSystemPort } from './filesystem-port.js';

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

export function remoteFileFor(file: string): RemoteFileRecord | undefined {
  return records.get(path.resolve(file));
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
