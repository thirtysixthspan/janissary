import { closeSync, constants, linkSync, lstatSync, mkdirSync, openSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getOpencodeOauth, type OpencodeOauth } from '../project/opencode-oauth.js';

export const OPENCODE_OAUTH_FAILURE_NOTICE = 'ChatGPT OAuth unavailable: could not prepare private OpenCode credentials.';

export type OpencodePreparation =
  | { type: 'available'; dataHome: string }
  | { type: 'absent' }
  | { type: 'failed'; reason: 'unsafe' | 'storage' };

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
  try {
    writeOauth(dataHome, oauth);
  } catch (error) {
    try { rmSync(dataHome, { recursive: true, force: true }); } catch { throw error; }
    throw error;
  }
  return dataHome;
}

function writeOauth(dataHome: string, oauth: OpencodeOauth): void {
  const directory = path.join(dataHome, 'opencode');
  mkdirSync(directory, { mode: 0o700 });
  const staging = path.join(directory, '.auth-seed');
  const descriptor = openSync(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(descriptor, JSON.stringify({ openai: oauth })); } finally { closeSync(descriptor); }
  linkSync(staging, authFile(dataHome));
  try { unlinkSync(staging); } catch { return; }
}

export function prepareOpencodeData(tmpDir: string): OpencodePreparation {
  if (!isDirectory(tmpDir)) return { type: 'failed', reason: 'unsafe' };
  if (!getOpencodeOauth()) return { type: 'absent' };
  try {
    const dataHome = prepareOpencodeDataHome(tmpDir);
    return dataHome ? { type: 'available', dataHome } : { type: 'failed', reason: 'unsafe' };
  } catch {
    return { type: 'failed', reason: 'storage' };
  }
}

export function workspaceOpencodeDataHome(workspaceDir: string | undefined): string | undefined {
  if (!workspaceDir) return undefined;
  return opencodeDataHome(`${workspaceDir}.tmp`);
}
