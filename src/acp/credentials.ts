import { lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { prepareOpencodeDataHome } from '../sandbox/opencode-data.js';

export function acpCredentials(cwd: string, workspaceDir?: string): { env: Record<string, string>; tmpDir?: string; dispose: () => void } {
  if (workspaceDir) return { env: {}, dispose: () => {} };
  const runtime = path.join(cwd, '.janissary');
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  if (!lstatSync(runtime).isDirectory()) throw new Error('Unsafe ACP runtime directory.');
  const directory = mkdtempSync(path.join(runtime, 'acp-'));
  const dispose = () => rmSync(directory, { recursive: true, force: true });
  try {
    const dataHome = prepareOpencodeDataHome(directory);
    return { env: dataHome ? { XDG_DATA_HOME: dataHome } : {}, tmpDir: directory, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
