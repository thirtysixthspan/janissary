import { isInsideRoot } from '../plugins/files.js';
import type { Tab } from '../tab/types.js';

// Where a new tab starts when it inherits its source tab's directory. The source's directory is
// kept only when it lies inside the bound that applies to the new tab; otherwise the tab starts
// where the specs say it does by default. Without the bound an unconfined tab could start inside a
// workspaced tab's clone, which is deleted under it when that tab closes, and a confined tab could
// start outside the one directory its sandbox profile allows.

// `zsh --no-workspace`: the project checkout, or a directory inside it that a local, unconfined
// source is in. A workspaced source's directory belongs to its clone and a remote source's to another
// host, so neither is inherited.
export function unconfinedAgentCwd(creator: Tab, cwd: string | undefined, launchDir: string): string {
  if (creator.remote || creator.workspaceDir !== undefined || cwd === undefined) return launchDir;
  return isInsideRoot(launchDir, cwd) ? cwd : launchDir;
}
