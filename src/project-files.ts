import type { Managers } from './managers.js';
import { listProjectFiles } from './file-navigator/search.js';

// Resolve the project/launch directory's gitignore-aware file list for the `projectFiles` RPC
// (Cmd+P quick open). The Controller owns the RPC-facing fallback when listing fails, so a
// failure can never leave `client.request` pending.
export async function projectFilesFor(managers: Managers): Promise<{ root: string; paths: string[] }> {
  const root = managers.tab.launchDir;
  const paths = await listProjectFiles(root);
  return { root, paths };
}
