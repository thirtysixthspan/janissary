import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from '../remote/protocol.js';
import type { CommitResult } from '../git/commit.js';
import type { GitMetadata } from './filesystem-port.js';
import type { RemotePortPaths } from './remote-port-paths.js';

// `RemoteFileSystemPort`'s three git operations, extracted so that file stays under the size limit —
// the same split `remote-port-history.ts`, `-paths.ts`, `-requests.ts`, and `-watchers.ts` already
// use. Each takes the port's bound request sender and its path mapper as parameters rather than
// reaching for them, so nothing here knows about the port's session bookkeeping.
export type RemoteRequest = <T>(
  operation: RemoteFilesystemOperation, args: RemoteFilesystemArguments,
) => Promise<T>;

// The far side answers with statuses relative to its own workspace root, so they are filtered and
// re-based onto the tree's root here. A failed request is reported as "no git metadata" rather than
// rejecting: the tree renders fine without colouring, and there is nowhere to put a reason.
export function remoteGitMetadata(
  request: RemoteRequest, paths: RemotePortPaths, root: string,
  onResult: (metadata: GitMetadata) => void,
): void {
  void request<GitMetadata>('git', {}).then(async (metadata) => {
    onResult({ ...metadata, statuses: await paths.filterEntries(root, metadata.statuses) });
  }, () => onResult({ statuses: [] }));
}

// `git-pull` carries no path arguments: the far side pulls its own workspace root, so the port's
// `root` never reaches here. The reply carries git's own outcome summary, which only the host that
// ran the pull can know.
export function remoteGitPull(request: RemoteRequest): Promise<string> {
  return request('git-pull', {});
}

// Unlike the pull, a commit names paths — and the far side resolves them against the *workspace*
// root rather than the navigator's, so each one is mapped before it crosses the wire, exactly as
// `delete-many` maps its own. Sending them unmapped is the failure this closes: on a navigator
// rooted below the workspace root it would stage the wrong files, or none, while every layer
// reported success. An empty list is the header button's whole-tree form: the far side has one
// workspace root shared by every navigator, so the navigator's own root travels alongside as its
// workspace-relative prefix, computed the same way a named path is — `paths.to` with nothing to
// append — rather than leaving the far side to guess which subtree "everything" means.
export async function remoteGitCommit(
  request: RemoteRequest, paths: RemotePortPaths, root: string, message: string, relPaths: string[],
): Promise<CommitResult> {
  if (relPaths.length === 0) {
    return request('git-commit', { message, paths: [], root: await paths.to(root, '') });
  }
  const remotePaths = await Promise.all(relPaths.map((relPath) => paths.to(root, relPath)));
  return request('git-commit', { message, paths: remotePaths });
}
