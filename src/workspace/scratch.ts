import { mkdirSync } from 'node:fs';
import { prepareOpencodeDataHome } from '../sandbox/opencode-data.js';

export function createWorkspaceScratch(workspaceDir: string): void {
  const tmpDir = `${workspaceDir}.tmp`;
  mkdirSync(tmpDir, { mode: 0o700 });
  prepareOpencodeDataHome(tmpDir);
}
