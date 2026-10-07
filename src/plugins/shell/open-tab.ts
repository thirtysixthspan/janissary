import type { TabPluginServerCapabilities } from '../api.js';
import { isInsideRoot } from '../files.js';
import type { ZshStartupDirectory } from './zsh-startup-directory.js';
import { createShellMarkerNonce } from './zsh-startup-script.js';
import { spawnShell } from './spawn-shell.js';

// Opens a sibling shell beside the one ➕ or `Cmd+T` came from: unsandboxed beside an unsandboxed
// shell, and confined to the same clone, in the same offline mode, beside a sandboxed one. A typed
// `zsh` goes through `launch-tab.ts` instead, which provisions a clone of its own.

export function openShellTab(
  capabilities: TabPluginServerCapabilities,
  instanceKey: string,
  startup: ZshStartupDirectory,
): void {
  const origin = capabilities.originTab();
  if (!origin) return;
  if (origin.remote) capabilities.rejectRequest('A shell tab cannot be opened from a remote tab.');
  const workspace = origin.workspace && { dir: origin.workspace.dir, offline: origin.workspace.offline ?? false };
  // A shell that has `cd`-ed out of the project leaves its tab recording a directory no terminal may
  // start in, so the new shell starts where its workspace or project does rather than not at all.
  // Judged with the host's own resolved containment check, so a directory the host's spawn bound
  // would refuse falls back here instead of reaching it.
  const allowed = isInsideRoot(origin.root, origin.cwd)
    || (workspace !== undefined && isInsideRoot(workspace.dir, origin.cwd));
  const cwd = allowed ? origin.cwd : workspace?.dir ?? origin.root;

  capabilities.openOrFocusTab(instanceKey, (resources) => ({
    title: 'shell',
    payload: spawnShell(resources, {
      instanceKey, cwd, root: origin.root, hookNonce: createShellMarkerNonce(), ...(workspace && { workspace }),
    }, startup),
  }));
}
