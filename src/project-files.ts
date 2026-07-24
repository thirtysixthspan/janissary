import type { Managers } from './managers.js';
import { listProjectFiles } from './file-navigator/search.js';

// Resolve the project/launch directory's gitignore-aware file list for the `projectFiles` RPC
// (Cmd+P quick open) — bridged straight off `message-handler.ts` (mirroring `openTranscriptFor`)
// so `controller.ts` stays under its line-size limit. Never rejects: `listProjectFiles` itself
// only throws on programmer error, but the caller still wraps this in a `.catch` (message-handler)
// so a failure can never leave `client.request` pending.
export async function projectFilesFor(managers: Managers): Promise<{ root: string; paths: string[] }> {
  const root = managers.tab.launchDir;
  const paths = await listProjectFiles(root);
  return { root, paths };
}
