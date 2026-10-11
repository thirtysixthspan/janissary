import { closeSync, constants, lstatSync, mkdirSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getOpencodeOauth } from '../project/opencode-oauth.js';

function authFile(dataHome: string): string {
  return path.join(dataHome, 'opencode', 'auth.json');
}

function isDirectory(directory: string): boolean {
  try { return lstatSync(directory).isDirectory(); } catch { return false; }
}

export function opencodeDataHome(tmpDir: string): string | undefined {
  const dataHome = path.join(tmpDir, 'opencode-data');
  if ([tmpDir, dataHome, path.join(dataHome, 'opencode')].some((directory) => !isDirectory(directory))) return undefined;
  try {
    if (!lstatSync(authFile(dataHome)).isFile()) return undefined;
    const resolved = realpathSync(dataHome);
    return resolved === path.join(realpathSync(tmpDir), 'opencode-data') ? resolved : undefined;
  } catch {
    return undefined;
  }
}

export function prepareOpencodeDataHome(tmpDir: string): string | undefined {
  if (!isDirectory(tmpDir)) throw new Error('Unsafe OpenCode scratch directory.');
  const oauth = getOpencodeOauth();
  if (!oauth) return undefined;
  const dataHome = path.join(tmpDir, 'opencode-data');
  try {
    mkdirSync(dataHome, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return opencodeDataHome(tmpDir);
  }
  mkdirSync(path.join(dataHome, 'opencode'), { mode: 0o700 });
  const descriptor = openSync(authFile(dataHome), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(descriptor, JSON.stringify({ openai: oauth })); } finally { closeSync(descriptor); }
  return dataHome;
}

export function workspaceOpencodeDataHome(workspaceDir: string | undefined): string | undefined {
  if (!workspaceDir) return undefined;
  return opencodeDataHome(`${workspaceDir}.tmp`);
}
