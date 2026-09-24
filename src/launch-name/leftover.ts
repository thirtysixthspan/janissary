import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { isOwnInstanceAlive, isPidAlive, readLockPid } from '../instance-lock.js';
import { untrustWorkspace, workspacePath } from '../workspace/index.js';
import { workspaceLabelError } from '../workspace/label.js';
import { errorText } from '../error-text.js';
import { sameLaunchName } from './check.js';

// A workspace folder named after a launch's label, and whether anything still owns it. Shared by the
// local launch paths and `janus remote-serve`'s provision check, which is why everything is located
// from `workspacePath(label)` alone: both sides have already initialized it against their own root.

// Where `DetachedPeer` writes its records: `.janissary/remote/`, the sibling of the workspace base.
function peerRecordDir(label: string): string {
  return path.join(path.dirname(path.dirname(workspacePath(label))), 'remote');
}

function readPeerRecord(file: string): { pid?: unknown; label?: unknown } | undefined {
  try {
    const record = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    return typeof record === 'object' && record !== null ? record : undefined;
  } catch {
    return undefined;
  }
}

// A live `remote-serve` peer — attached or parked — that has provisioned (or is provisioning) `label`,
// or a name differing from it only by case: on a case-insensitive filesystem both are one folder.
// A record whose pid is dead is ignored: the attach path already treats it as terminated.
function hasLivePeer(label: string): boolean {
  const dir = peerRecordDir(label);
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith('.json'));
  } catch {
    return false;
  }
  return files.some((file) => {
    const record = readPeerRecord(path.join(dir, file));
    return typeof record?.label === 'string' && sameLaunchName(record.label, label) && typeof record.pid === 'number' && record.pid > 0 && isPidAlive(record.pid);
  });
}

/**
 * Whether a workspace named `label` has a live janissary owner: a labeled peer record with a live
 * pid, a janus instance lock inside it held by a live process, or — through `tabUses` — an open
 * local tab using it. A plain shell sitting in the folder does not count.
 */
export function isWorkspaceRunning(label: string, tabUses: (dir: string) => boolean): boolean {
  const dir = workspacePath(label);
  if (hasLivePeer(label)) return true;
  const lockPid = readLockPid(dir);
  if (lockPid !== undefined && isOwnInstanceAlive(lockPid)) return true;
  return tabUses(dir);
}

/**
 * Remove a leftover workspace folder named `label` and its `.tmp` sibling, even with uncommitted
 * work in it. Returns the error text when the removal fails, and undefined on success — including
 * when there was nothing to remove. Unlike `removeWorkspace`, which swallows every error, a failure
 * here is reported: the launch it would have cleared the way for is refused instead. The trust
 * entry goes first, so a failed trust-file write leaves the folder untouched; a removal that fails
 * partway leaves the rest in place for the next launch to try again. A label that cannot name one
 * folder under the workspace base is refused the same way, before anything is touched, so no caller
 * can reach outside the base through this.
 */
export function removeLeftoverWorkspace(label: string): string | undefined {
  const invalid = workspaceLabelError(label);
  if (invalid !== undefined) return invalid;
  const dir = workspacePath(label);
  const scratch = `${dir}.tmp`;
  try {
    untrustWorkspace(dir);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    if (existsSync(scratch)) rmSync(scratch, { recursive: true });
  } catch (error) {
    return errorText(error);
  }
  return undefined;
}

// Whether a leftover folder is there to remove at all. Never for a label outside the workspace base.
export function hasLeftoverWorkspace(label: string): boolean {
  return workspaceLabelError(label) === undefined && existsSync(workspacePath(label));
}
