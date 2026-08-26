// What `janus remote-serve` tells the tab that asked for a workspace, beyond "it is ready": the
// facts about this machine the local side cannot work out for itself. Isolation is one of them
// (`sandboxNotice`), and which GitHub credential the workspace ended up with is the other — the
// local side forwards its token hopefully, and only the remote knows whether it arrived.
//
// Kept apart from `serve.ts` because it is pure string composition with no session state, the same
// reason `serve-root.ts` and `serve-processes.ts` sit beside it rather than inside it.

// Says what janissary did, not what will happen: on a host without isolation nothing scrubs the
// environment, so an ambient token of the remote user's own may still be sitting there. Claiming
// "git push will fail" would be an overclaim in exactly that case.
const NO_TOKEN = 'github token: none configured on either machine, so none was injected for git push or gh';
// No semicolon inside either message: `workspaceReadyNotice` joins on `; `, so an internal one
// would read as a third notice.
const OWN_TOKEN = 'github token: none forwarded from the initiating project, using this machine\'s own';

/**
 * The credential notice for a freshly provisioned remote workspace, or `undefined` when the
 * forwarded token is the one in use — the case that needs no comment. Mirrors `sandboxNotice`'s
 * contract deliberately: a notice exists only when there is something the user needs to know.
 *
 * The spoken cases are both "the local machine's token is not what this workspace has", which is
 * otherwise invisible: the tab opens, the harness runs, and only a later `git push` fails.
 */
export function githubTokenNotice(forwarded: string | undefined, own: string | undefined): string | undefined {
  if (forwarded) return undefined;
  return own ? OWN_TOKEN : NO_TOKEN;
}

/**
 * Join the notices a `workspace-ready` frame should carry into the one string the frame has room
 * for, dropping the absent ones. `undefined` when nothing needs saying, so the tab appends no line
 * at all.
 */
export function workspaceReadyNotice(...notices: (string | undefined)[]): string | undefined {
  const present = notices.filter((notice): notice is string => Boolean(notice));
  return present.length === 0 ? undefined : present.join('; ');
}
