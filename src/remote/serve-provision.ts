import { getProjectTokens, type ProjectTokens } from '../project/tokens.js';
import { setGitIdentity, type GitIdentity } from '../git/identity.js';
import { sandboxNotice } from '../sandbox/index.js';
import { workspacePath } from '../workspace/index.js';
import type { WorkspaceManager } from '../workspace/manager.js';
import { hasLeftoverWorkspace, isWorkspaceRunning, removeLeftoverWorkspace } from '../launch-name/leftover.js';
import { errorText } from '../error-text.js';
import type { ServerFrame } from './protocol.js';
import { RemoteProcesses } from './serve-processes.js';
import { RemoteAcp } from './serve-acp.js';
import { RemoteFileNavigators } from './serve-file-navigator.js';
import { githubTokenNotice, workspaceReadyNotice } from './serve-notice.js';
import type { DetachedPeer } from './serve-detach.js';

// `RemoteServer.provision`, split out the way `serve-detach-query.ts` was, to keep `serve.ts` under
// the size limit: everything a `provision` frame sets in motion, from the label check through the
// clone to the workspace's process, navigator, and ACP hosts.

export type ProvisionedWorkspace = {
  dir: string;
  processes: RemoteProcesses;
  files: RemoteFileNavigators;
  acp: RemoteAcp;
};

export type ProvisionContext = {
  emit: (frame: ServerFrame) => void;
  workspaces: WorkspaceManager;
  peer: DetachedPeer | undefined;
  // A workspace is already provisioned here, or this server is shutting down.
  idle: () => boolean;
  stopping: () => boolean;
  provisioned: (workspace: ProvisionedWorkspace) => void;
};

/**
 * Check the label, then clone the project root's `origin` into `.janissary/workspace/<label>` under
 * this root, using the very same `WorkspaceManager` the local server uses for a `-w` launch.
 *
 * A label with a live owner on this host is refused with `name-in-use` and nothing is provisioned. A
 * leftover folder under it with nothing running is removed first — a failed removal is refused the
 * same way, carrying the path and the reason — and a successful one is reported on `workspace-ready`.
 * The label goes into this peer's record before the clone starts, so a second provision of it on
 * this host from here on sees it running.
 */
export async function provisionRemoteWorkspace(
  context: ProvisionContext, label: string, forwarded: ProjectTokens, identity: GitIdentity,
): Promise<void> {
  const { emit, workspaces } = context;
  if (!context.idle()) return;
  if (isWorkspaceRunning(label, () => false)) { emit({ type: 'name-in-use', label }); return; }
  const leftover = hasLeftoverWorkspace(label) ? workspacePath(label) : undefined;
  const failure = removeLeftoverWorkspace(label);
  if (failure !== undefined) { emit({ type: 'name-in-use', label, path: workspacePath(label), reason: failure }); return; }
  context.peer?.setLabel(label);
  const result = workspaces.create(label);
  if ('error' in result) { emit({ type: 'workspace-failed', message: result.error }); return; }
  try {
    await result.ready;
  } catch (error) {
    emit({ type: 'workspace-failed', message: errorText(error) });
    return;
  }
  if (context.stopping()) { workspaces.removeAll(); return; }
  const own = getProjectTokens();
  // Per token, a forwarded value wins and this machine's own file is the fallback — spreading own
  // first and forwarded over it says exactly that, since `loadProjectTokens` omits absent
  // credentials rather than storing them as undefined.
  //
  // Only the GitHub credential gets a notice. A missing harness credential announces itself in
  // that harness's own output the moment it starts, and most remote launches have none configured
  // on either machine and are working as intended, so a mirrored notice would speak on the
  // ordinary case rather than warn about anything.
  const tokens = { ...own, ...forwarded };
  // The identity, unlike the tokens, is replaced whole or not at all: a name from the local
  // machine paired with an email from this one belongs to nobody, so a forwarded identity either
  // stands on its own or this machine's own stays as the fallback.
  if (Object.keys(identity).length > 0) setGitIdentity(identity);
  context.provisioned({
    dir: result.dir,
    processes: new RemoteProcesses(emit, result.dir, label, tokens),
    files: new RemoteFileNavigators(emit, result.dir),
    acp: new RemoteAcp(emit, result.dir, tokens),
  });
  emit({
    type: 'workspace-ready',
    dir: result.dir,
    notice: workspaceReadyNotice(sandboxNotice(), githubTokenNotice(forwarded.github, own.github)),
    ...(leftover !== undefined && { cleaned: leftover }),
  });
}
