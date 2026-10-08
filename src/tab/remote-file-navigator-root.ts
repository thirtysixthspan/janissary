import { abbreviateWorkspacePath } from '../paths.js';

// A remote file navigator's root in the `$workspace` form its header shows — the one place a remote
// navigator's own root is read as display text, which is why it comes from the shared rule rather
// than carrying a second copy of it. Undefined when the tab's remote workspace is gone.
export function remoteFileNavigatorRoot(root: string, workspace: string): string | undefined {
  return abbreviateWorkspacePath(workspace, root);
}
