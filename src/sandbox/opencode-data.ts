import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getOpencodeOauth } from '../project/opencode-oauth.js';
import { resolvePath } from './resolve.js';

function authFile(dataHome: string): string {
  return path.join(dataHome, 'opencode', 'auth.json');
}

export function prepareOpencodeDataHome(tmpDir: string): string | undefined {
  const dataHome = path.join(tmpDir, 'opencode-data');
  if (existsSync(authFile(dataHome))) return dataHome;
  const oauth = getOpencodeOauth();
  if (!oauth) return undefined;
  mkdirSync(path.join(dataHome, 'opencode'), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(authFile(dataHome), JSON.stringify({ openai: oauth }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return dataHome;
}

export function workspaceOpencodeDataHome(workspaceDir: string | undefined): string | undefined {
  if (!workspaceDir) return undefined;
  const dataHome = path.join(resolvePath(`${workspaceDir}.tmp`), 'opencode-data');
  return existsSync(authFile(dataHome)) ? dataHome : undefined;
}
