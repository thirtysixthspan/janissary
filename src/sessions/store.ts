import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { userInfo } from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from '../atomic-write.js';
import { REMOTE_DETACH_TIMEOUT_MS } from '../remote/serve-detach.js';

// Janissary's own record of the remote sessions it has launched, so a peer that outlived the process
// that started it can still be found. Everything else about a remote session is in-memory state on
// `RemoteManager`, which is exactly why quitting used to make a live peer unreachable: the far side
// waits `REMOTE_DETACH_TIMEOUT_MS` to be reattached and nothing local remembered its id.
//
// One file per account, in the project's own `.janissary/`, so opening janissary on another project
// lists only that project's sessions, which matches what a remote launch is: a clone of *this*
// project's origin. Per account because `acquireLock` admits a second janissary under a different
// account in one shared directory — a recorded pid that account cannot signal reads as stale — and
// a record file both such writers rename would be last-writer-wins at every mirror. Each writes its
// own, and a load merges every writer's file back into one list, so the directory's janissaries
// still describe one project's sessions. The pre-keying `remote-sessions.json` is read the same way,
// so a parked session survives an upgrade without any migration step.

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
let recordDir = '';

// The file's name carries a hash rather than the account's own spelling: the hash is filesystem-safe
// by construction, and two accounts whose names differ only by case stay distinct on case-insensitive
// filesystems. A platform without a usable account name — some embedded setups — shares 'unknown',
// which collapses back to the pre-keying behavior: one file, one writer.
function accountHash(): string {
  let name;
  try { name = userInfo().username; } catch { name = ''; }
  return createHash('sha256').update(name || 'unknown').digest('hex').slice(0, 8);
}

export function initRemoteSessionStore(projectDirectory: string): void {
  if (!projectDirectory) { recordDir = ''; recordFile = ''; return; }
  recordDir = path.join(projectDirectory, '.janissary');
  recordFile = path.join(recordDir, `remote-sessions.${accountHash()}.json`);
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

function currentRecordFiles(): string[] {
  if (!recordDir) return [];
  let names;
  try { names = readdirSync(recordDir); } catch { return []; }
  const files = names
    .filter((name) => name.startsWith('remote-sessions') && name.endsWith('.json'))
    .map((name) => path.join(recordDir, name));
  if (!files.includes(recordFile)) files.push(recordFile);
  return files;
}

export function loadRemoteSessions(now = Date.now()): RemoteSessionRecord[] {
  if (!recordFile) return [];
  const records: RemoteSessionRecord[] = [];
  for (const file of currentRecordFiles()) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    records.push(...parseRemoteSessions(text));
  }
  return pruneRemoteSessions(dedupeBySession(records), now);
}

// Two writers under different accounts can both hold a record for the same session id — one mirror
// each — and picking the newest keeps the search order that a single writer produced.
function dedupeBySession(records: RemoteSessionRecord[]): RemoteSessionRecord[] {
  const bySession = new Map<string, RemoteSessionRecord>();
  for (const record of records) {
    const existing = bySession.get(record.session);
    if (!existing || record.activity > existing.activity) bySession.set(record.session, record);
  }
  return [...bySession.values()];
}

export function saveRemoteSessions(records: readonly RemoteSessionRecord[]): void {
  if (!recordFile) return;
  mkdirSync(path.dirname(recordFile), { recursive: true });
  atomicWriteFile(recordFile, JSON.stringify(records, undefined, 2));
}
