import { mkdirSync } from 'node:fs';
import { OPENCODE_OAUTH_FAILURE_NOTICE, prepareOpencodeData } from '../sandbox/opencode-data.js';

export function createWorkspaceScratch(workspaceDir: string): string | undefined {
  const tmpDir = `${workspaceDir}.tmp`;
  mkdirSync(tmpDir, { mode: 0o700 });
  const result = prepareOpencodeData(tmpDir);
  return result.type === 'failed' ? OPENCODE_OAUTH_FAILURE_NOTICE : undefined;
}
