import type { RootRefusal } from '../remote/root-refusal.js';

// Every line a launch-name refusal, a remote root refusal, a leftover cleanup, or a root clone posts
// to the notifications feed, in one place so the local check, the remote answer's routing, and the
// tests all read the same wording.
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

// A name that cannot become a workspace folder at all; `reason` is `workspaceLabelError`'s answer.
export function invalidNameRefusal(name: string, reason: string): string {
  return `Cannot launch "${name}": ${reason}.`;
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

// A remote launch whose missing project root was cloned onto the host first.
export function clonedNotice(url: string, path: string, host: string): string {
  return `Cloned ${url} into ${path} on ${host}.`;
}

// Why a remote host could not settle a project root for `name`, one line per refusal kind. `path` is
// the folder each kind is about; for a declined or failed clone, the folder the clone would have
// gone into.
export function rootRefusalMessage(name: string, host: string, refusal: RootRefusal): string {
  const { path } = refusal;
  const prefix = `Cannot launch "${name}": `;
  switch (refusal.kind) {
    case 'declined': { return `${prefix}${path} on ${host} is not a clone of this project — clone declined.`; }
    case 'clone-failed': {
      return `${prefix}cloning ${refusal.url} into ${path} on ${host} failed — ${stripStop(refusal.reason)}.`;
    }
    case 'different-origin': { return `${prefix}${path} on ${host} is a clone of ${refusal.other}, not ${refusal.url}.`; }
    case 'not-repository': { return `${prefix}${path} on ${host} is not a git repository.`; }
    case 'occupied': { return `${prefix}${path} on ${host} exists and is not a clone of this project.`; }
    case 'no-origin': { return `${prefix}${path} on ${host} has no "origin" remote.`; }
    case 'no-repo-name': { return `${prefix}cannot name a folder for ${refusal.url} under ${path} on ${host}.`; }
    case 'not-found': { return `${prefix}${path} on ${host} does not exist.`; }
    case 'no-repository-found': { return `${prefix}no git repository found at or above ${path} on ${host}.`; }
  }
}

// A reason is embedded mid-sentence ahead of the line's own full stop, so its trailing one is dropped
// rather than doubled — the same trim `ProfileManager.finish` applies to a failure's reason.
function stripStop(reason: string): string {
  return reason.replace(/[.\s]+$/, '');
}
