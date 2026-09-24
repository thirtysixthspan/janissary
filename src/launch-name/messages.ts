// Every line a launch-name refusal or a leftover cleanup posts to the notifications feed, in one
// place so the local check, the remote answer's routing, and the tests all read the same wording.
// `<host>` is the bare host as the sessions tab shows it; `<path>` is the workspace's absolute path
// on the machine that holds it.

export const POOL_EXHAUSTED = 'All agent names are in use.';

export function openTabRefusal(name: string): string {
  return `Cannot launch "${name}": a tab named "${name}" is already open.`;
}

export function sessionsRowRefusal(name: string, state: string, host: string): string {
  return `Cannot launch "${name}": "${name}" is already in the sessions tab (${state} on ${host}).`;
}

export function remoteRunningRefusal(name: string, host: string): string {
  return `Cannot launch "${name}": "${name}" is already running on ${host}.`;
}

// The local counterpart of `remoteRunningRefusal`: a workspace on this machine that a live tab or a
// live janus instance is still using. There is no host to name, so the path says where it is.
export function localRunningRefusal(name: string, path: string): string {
  return `Cannot launch "${name}": "${name}" is already running (${path}).`;
}

export function checkUnansweredRefusal(name: string, host: string, reason: string): string {
  return `Cannot launch "${name}": could not check ${host} for an existing "${name}" — ${stripStop(reason)}.`;
}

// `host` is left out for a local removal.
export function removalFailedRefusal(name: string, path: string, reason: string, host?: string): string {
  const where = host === undefined ? '' : ` on ${host}`;
  return `Cannot launch "${name}": could not remove leftover workspace "${name}"${where} (${path}) — ${stripStop(reason)}.`;
}

export function harnessRetriesRefusal(first: string, last: string, host: string): string {
  return `Cannot launch "${first}": "${first}" through "${last}" are already running on ${host}.`;
}

export function poolRetriesRefusal(tried: readonly string[], host: string): string {
  return `Cannot launch agent on ${host}: ${tried.length} names tried (${tried.join(', ')}) are already running on ${host}.`;
}

// `host` is left out for a local cleanup.
export function cleanedNotice(name: string, path: string, host?: string): string {
  const where = host === undefined ? '' : ` on ${host}`;
  return `Removed leftover workspace "${name}"${where} (${path}) before launching.`;
}

// A reason is embedded mid-sentence ahead of the line's own full stop, so its trailing one is dropped
// rather than doubled — the same trim `ProfileManager.finish` applies to a failure's reason.
function stripStop(reason: string): string {
  return reason.replace(/[.\s]+$/, '');
}
