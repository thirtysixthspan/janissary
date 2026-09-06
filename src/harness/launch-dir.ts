import type { Managers } from '../managers.js';
import type { ProvisioningWorkspace } from '../workspace/manager.js';

// Where a harness tab starts on disk. Both launch surfaces — the `harness` command and a profile
// entry — ask the same two questions in the same order, so they live together here rather than as a
// pair of private methods on the manager, which owns command handling and tab wiring instead.

export type LaunchDir = {
  cwd: string;
  workspaceDir: string | undefined;
  // Only set for a workspace clone still in flight. Its `cwd` is already the clone's target
  // directory (known synchronously, see `WorkspaceManager.create`), so the tab and its cwd can be
  // set up immediately without waiting for this to resolve.
  ready: Promise<void> | undefined;
};

/**
 * The starting directory for a harness tab: a new workspace clone (with `workspace`) or
 * `fallbackCwd`. Returns the error string to surface when there is no repo or the remote cannot be
 * read — both fail synchronously, before anything is cloned.
 *
 * A clone comes back from `WorkspaceManager.create` as `{ dir, ready }` rather than a bare string,
 * which is what lets the caller tell it apart from the fallback cwd, record it on the tab for
 * cleanup on close, and defer the PTY spawn until the clone has finished.
 */
export function resolveLaunchDir(
  managers: Managers, workspace: boolean, label: string, fallbackCwd: string,
): string | LaunchDir {
  const resolved: string | ProvisioningWorkspace | { error: string } = workspace
    ? managers.workspace.create(label)
    : fallbackCwd;
  if (typeof resolved !== 'string' && 'error' in resolved) return resolved.error;
  return {
    cwd: typeof resolved === 'string' ? resolved : resolved.dir,
    workspaceDir: typeof resolved === 'string' ? undefined : resolved.dir,
    ready: typeof resolved === 'string' ? undefined : resolved.ready,
  };
}
