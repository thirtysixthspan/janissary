import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { REMOTE_DETACH_TIMEOUT_MS } from '../remote/serve-detach.js';

// Janissary's own record of the remote sessions it has launched, so a peer that outlived the process
// that started it can still be found. Everything else about a remote session is in-memory state on
// `RemoteManager`, which is exactly why quitting used to make a live peer unreachable: the far side
// waits `REMOTE_DETACH_TIMEOUT_MS` to be reattached and nothing local remembered its id.
//
// One file rather than one per session, because `acquireLock` already refuses a second janissary in
// one project directory — there is no second writer to race with. It lives in the project's own
// `.janissary/`, so opening janissary on another project lists only that project's sessions, which
// matches what a remote launch is: a clone of *this* project's origin.

export type RemoteProcessKind = 'harness' | 'agent';

// One process still running inside the far side's workspace, as this side last knew it. The spawn id
// is what the reattached channel routes output for; the label is the tab it came from and the tab a
// reattach recreates.
export type RemoteSessionProcess = {
  id: string;
  label: string;
  kind: RemoteProcessKind;
  // The harness name, for a harness process. The launching tab is recreated before the peer answers
  // anything — it is the placeholder ssh's own prompts render in — so which harness to rebuild has
  // to be known from the record rather than from the far side.
  harness?: string;
};

export type RemoteSessionRecord = {
  // The far side's handshake session id — the only thing `reattach` needs to name a peer.
  session: string;
  // The address exactly as launched, plus the two derivations the rows and the ssh command need.
  address: string;
  destination: string;
  host: string;
  workspaceLabel: string;
  workspaceDir: string;
  // The tab that launched the channel, which a reattach recreates first so ssh's own prompts render
  // in it (decision 22).
  launchLabel: string;
  launchKind: RemoteProcessKind;
  processes: RemoteSessionProcess[];
  activity: number;
};

let recordFile = '';

export function initRemoteSessionStore(projectDirectory: string): void {
  recordFile = path.join(projectDirectory, '.janissary', 'remote-sessions.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProcess(value: unknown): value is RemoteSessionProcess {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.label === 'string' && value.label.length > 0
    && (value.kind === 'harness' || value.kind === 'agent')
    && (value.harness === undefined || (typeof value.harness === 'string' && value.harness.length > 0));
}

// Hand-written rather than schema-driven, for the reason every other guard in the tree is: this file
// is read from disk at startup and a field that is merely absent must produce one dropped record
// rather than a startup that throws.
export function isRemoteSessionRecord(value: unknown): value is RemoteSessionRecord {
  return isRecord(value)
    && typeof value.session === 'string' && value.session.length > 0
    && typeof value.address === 'string'
    && typeof value.destination === 'string'
    && typeof value.host === 'string'
    && typeof value.workspaceLabel === 'string'
    && typeof value.workspaceDir === 'string'
    && typeof value.launchLabel === 'string' && value.launchLabel.length > 0
    && (value.launchKind === 'harness' || value.launchKind === 'agent')
    && Array.isArray(value.processes) && value.processes.every((entry) => isProcess(entry))
    && typeof value.activity === 'number' && Number.isFinite(value.activity);
}

/**
 * A record whose last activity is older than the far side's own expiry describes a peer that cannot
 * still exist, so it is dropped on the way in and nothing is reported: the session ended on the
 * remote host days ago and janissary has nothing to add to that. Pruning here rather than at write
 * time is what makes it true for a record written by a janissary that has since been closed for a
 * week.
 */
export function pruneRemoteSessions(
  records: readonly RemoteSessionRecord[], now: number,
): RemoteSessionRecord[] {
  return records.filter((record) => now - record.activity < REMOTE_DETACH_TIMEOUT_MS);
}

// A file that is missing, truncated, or not an array of records reads as no sessions at all. It is
// janissary's own cache of what it launched, not user data, so a corrupt one costs the reattach
// buttons and nothing else.
export function parseRemoteSessions(text: string): RemoteSessionRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry) => isRemoteSessionRecord(entry));
}

// Replace the record for this session id, or append it. Keyed by session id rather than by label,
// because a reattached session takes a de-duplicated label (decision 23) while its id never moves.
export function mergeRemoteSession(
  records: readonly RemoteSessionRecord[], record: RemoteSessionRecord,
): RemoteSessionRecord[] {
  const without = records.filter((entry) => entry.session !== record.session);
  return [...without, record];
}

export function withoutRemoteSession(
  records: readonly RemoteSessionRecord[], session: string,
): RemoteSessionRecord[] {
  return records.filter((entry) => entry.session !== session);
}

export function loadRemoteSessions(now = Date.now()): RemoteSessionRecord[] {
  if (!recordFile) return [];
  let text: string;
  try {
    text = readFileSync(recordFile, 'utf8');
  } catch {
    return [];
  }
  return pruneRemoteSessions(parseRemoteSessions(text), now);
}

export function saveRemoteSessions(records: readonly RemoteSessionRecord[]): void {
  if (!recordFile) return;
  mkdirSync(path.dirname(recordFile), { recursive: true });
  atomicWriteFile(recordFile, JSON.stringify(records, undefined, 2));
}
