import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getOpencodeOauth } from '../project/opencode-oauth.js';
import { prepareOpencodeDataHome } from '../sandbox/opencode-data.js';

export function acpCredentials(workspaceDir?: string): { env: Record<string, string>; dispose: () => void } {
  if (workspaceDir || !getOpencodeOauth()) return { env: {}, dispose: () => {} };
  const directory = mkdtempSync(path.join(tmpdir(), 'janissary-acp-'));
  const dispose = () => rmSync(directory, { recursive: true, force: true });
  try {
    const dataHome = prepareOpencodeDataHome(directory);
    return { env: dataHome ? { XDG_DATA_HOME: dataHome } : {}, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
