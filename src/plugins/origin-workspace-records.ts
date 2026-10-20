import path from 'node:path';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { abbreviateWorkspaceDir } from '../paths.js';
import { workspacePath } from '../workspace/index.js';
import type { OriginWorkspace } from './api-origin-tab.js';

// The record builders the origin-workspace rules share. Every manager method is called optionally,
// because tests hand in partial managers.

export function localWorkspace(
  managers: Managers, dir: string, offline: boolean,
): { workspace: OriginWorkspace; provisioning: boolean } {
  return {
    workspace: { dir, offline, label: path.basename(dir), display: abbreviateWorkspaceDir(dir) },
    provisioning: managers.workspace?.provisioning?.(dir) ?? false,
  };
}

// Undefined when the far side has not answered, so there is no directory yet.
export function remoteWorkspace(managers: Managers, tab: Tab): OriginWorkspace | undefined {
  const workspace = channelWorkspace(managers, tab.label, tab.remote?.host);
  return workspace && { ...workspace, offline: tab.offline ?? false };
}

// The workspace of the channel `rideLabel` rides, keyed by label with the host passed in, for
// tabs that carry no remote target of their own. Undefined while the channel has no directory.
export function channelWorkspace(
  managers: Managers, rideLabel: string, host: string | undefined,
): OriginWorkspace | undefined {
  const dir = managers.remote?.workspaceOf?.(rideLabel);
  if (dir === undefined) return undefined;
  return {
    dir,
    offline: false,
    label: managers.remote?.workspaceLabelOf?.(rideLabel) ?? path.basename(dir),
    display: abbreviateWorkspaceDir(dir),
    ride: rideLabel,
    ...(host !== undefined && { host }),
  };
}

// An open tab riding a channel on `host` whose workspace is `dir`. Run-only lease entries are
// never in `liveEntries()`, so a workspace only a run holds answers undefined.
export function ridingTabFor(managers: Managers, host: string, dir: string): string | undefined {
  const entry = managers.remote?.liveEntries?.().find(
    (candidate) => candidate.address.host === host && candidate.workspaceDir === dir,
  );
  if (!entry) return undefined;
  return [...entry.labels].find((label) => managers.tab?.byLabel?.(label) !== undefined);
}

// The clone directory a local path lies in, when it is under the workspaces directory.
export function localCloneOf(file: string): string | undefined {
  let base: string;
  try {
    base = workspacePath('');
  } catch {
    return undefined;
  }
  const relative = path.relative(base, path.resolve(file));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return path.join(base, relative.split(path.sep)[0] ?? relative);
}

// The clone rule: a clone still held answers it; one no longer tracked answers gone.
export function cloneWorkspace(
  managers: Managers, clone: string,
): { workspace: OriginWorkspace; provisioning: boolean } {
  if (managers.workspace?.tracks?.(clone) ?? false) return localWorkspace(managers, clone, false);
  return { workspace: goneWorkspace(clone, path.basename(clone)), provisioning: false };
}

export function goneWorkspace(dir: string, label: string): OriginWorkspace {
  return { dir, label, display: dir ? abbreviateWorkspaceDir(dir) : '', gone: true };
}
