import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications.js';
import { clearRemoteFileCacheForWorkspace } from '../file-navigator/remote-file-cache.js';
import type { RemoteChannel } from './channel.js';
import type { RemoteProcessState } from './protocol.js';
import type { RemoteTranscriptSource } from './transcript-source.js';
import type { RemoteAddress } from './address.js';
import type { RemoteLaunchHandlers } from './manager.js';
import { cancelSessionState } from './resume.js';

export type RemoteEntry = {
  channel: RemoteChannel;
  transcript: RemoteTranscriptSource;
  address: RemoteAddress;
  labels: Set<string>;
  handlers: Map<string, RemoteLaunchHandlers>;
  ready: Promise<string>;
  resolveReady: (dir: string) => void;
  rejectReady: (error: Error) => void;
  workspaceDir?: string;
  settled: boolean;
  closed: boolean;
  workspaceLabel: string;
  attach: Attach;
  // The resolver of a `session-state` query waiting for its answer. One at a time: the only thing
  // that asks is an attach settling its tabs, and a channel has one of those in flight at most.
  // `undefined` is how it is told no answer is coming — see `cancelSessionState`.
  sessionState?: (processes: RemoteProcessState[] | undefined) => void;
  // False when this entry's ending has already been narrated by whoever settled it: the per-process
  // end lines a `finish()` sweep would otherwise emit are muted alongside the session's own line.
  // Absent means announce, which is how every ending that happens to a session on its own behaves.
  announceEnds?: boolean;
};

// The live remote-session set moved. Raised from the channel lifecycle rather than from a read of
// the list, which is what lets `SessionsManager` write its record the moment a session becomes
// recordable and lets an open sessions tab notice a change without a Refresh.
export function emitSessionsChanged(): void { messageBus.emit('sessions', { type: 'changed' }); }

export class Attach {
  active = false;
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;

  constructor(private connect: () => void, private abort: () => void) {}

  lost(): void {
    if (this.stopped || this.timer) return;
    this.active = true;
    clearTimeout(this.deadline);
    this.timer = setTimeout(() => this.retry(), Math.min(250 * 2 ** Math.min(this.attempt++, 7), 30_000));
    emitSessionsChanged();
  }

  retry(): void {
    if (this.stopped || !this.active) return;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = undefined;
    this.deadline = setTimeout(() => { this.abort(); this.lost(); }, 15_000);
    try { this.connect(); } catch { this.lost(); }
  }

  accepted(): void {
    const wasActive = this.active;
    this.active = false;
    this.attempt = 0;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = undefined;
    // Only a real transition. `stop()` funnels through here on entries that were never reconnecting,
    // and a row that has not moved is not news.
    if (wasActive) emitSessionsChanged();
  }

  stop(): void { this.accepted(); this.stopped = true; }
}

// A shared channel sits in the manager's table under every label holding it, so letting go of the
// entry means letting go of all of them — but only where the label still points at this entry, since
// a label reused for a fresh launch already names a different one.
export function dropRemoteLabels(entries: Map<string, RemoteEntry>, entry: RemoteEntry): void {
  for (const label of entry.labels) {
    if (entries.get(label) === entry) entries.delete(label);
  }
  entry.labels.clear();
}

// Only an entry already mid-backoff after losing its transport benefits from a resume: it has
// something to collapse the wait on. An attached channel's transport is healthy by definition — a
// resume signal has nothing to fix there, so forcing a replacement would only discard an
// unbuffered PTY gap for no reason.
export function resumeRemote(entry: RemoteEntry): void {
  if (entry.closed || !entry.channel.sessionId || !entry.workspaceDir || !entry.attach.active) return;
  entry.attach.retry();
}

// Marks and notifies the affected tabs only — it does not clear the workspace's local file cache,
// since a per-process end (`terminateRemoteProcess`) does not necessarily mean the session is over. Only
// `terminateRemoteEntry`, the genuine end of the shared workspace, clears the cache.
export function terminateRemoteSession(
  managers: Managers, labels: Iterable<string>, host: string, what: string, announce = true,
): void {
  const text = `${what} on ${host} terminated — create a new agent or shell to continue.`;
  let notified = false;
  for (const label of labels) {
    const tab = managers.tab.byLabel(label);
    if (!tab) continue;
    if (tab.sessionTerminated) continue;
    tab.sessionTerminated = text;
    if (tab.harness) {
      tab.harness.status = 'exited';
      tab.harness.sessionTerminated = text;
    } else {
      tab.log = [...tab.log, { input: '', output: text }];
      if (tab.runtime) tab.runtime.busy = false;
    }
    if (announce && !notified) {
      notify(managers, 'remote-session-terminated', label, text);
      notified = true;
    }
  }
  messageBus.emit('state', { type: 'dirty' });
}

export function terminateRemoteProcess(managers: Managers, entry: RemoteEntry, label: string, harness: boolean): void {
  // A sessions-driven settlement (`terminateRemoteEntry` with announcing suppressed) mutes the
  // per-process end lines too: the actions layer is the one narrator for that ending, and two
  // differently worded endings for one event would teach the feed's lines cannot be taken at their
  // word.
  terminateRemoteSession(managers, [label], entry.address.host,
    harness ? `Remote harness '${label}'` : 'Remote shell', entry.announceEnds !== false);
  const live = [...entry.labels].some((owner) => {
    const tab = managers.tab.byLabel(owner);
    return tab && tab.view !== 'files' && !tab.sessionTerminated;
  });
  if (!live) terminateRemoteEntry(managers, entry, false);
}

// The session no longer exists, so its list record does not survive it either — otherwise a closed
// harness would leave a detached row for a peer that was actually shut down, and the same session
// would read as two lines in the list. Guarded because a `Managers` without a settled sessions
// manager (test harnesses) keeps working.
export function dropTerminatedSessionRecord(managers: Managers, session: string | undefined): void {
  if (session !== undefined) managers.sessions?.dropSession(session);
}

/**
 * Give up a live session locally while deliberately leaving it running on its host — the sibling of
 * `terminateRemoteEntry`, and the opposite decision. Everything the ordinary last-label release does
 * happens here except the one thing that matters: `finish()` is never called, so no `kill`,
 * `acp-close`, `filesystem-close`, or `shutdown` frame is sent. The far side sees only its transport
 * go, which is the SIGHUP path that parks a peer for `REMOTE_DETACH_TIMEOUT_MS`.
 *
 * Refused for an entry with no workspace directory or no session id: there is nothing to come back
 * to yet, which is the same test the automatic recovery applies before treating a lost transport as
 * recoverable rather than as a failed launch.
 */
export function detachRemoteEntry(entry: RemoteEntry): boolean {
  if (entry.closed || !entry.workspaceDir || !entry.channel.sessionId) return false;
  entry.closed = true;
  entry.attach.stop();
  cancelSessionState(entry);
  clearRemoteFileCacheForWorkspace(entry.address.host, entry.workspaceLabel);
  entry.handlers.clear();
  entry.channel.disconnect();
  return true;
}

/**
 * End a live session for good: recovery stops, the shutdown frames go out, and the tabs are marked
 * and told about it unless `announce` is off.
 *
 * The entry's launch handlers are returned rather than called. Most terminations are something that
 * happened to the session, and their tabs stay open holding the transcript that explains it — but an
 * explicit `RemoteManager.close` is the user ending the session on purpose, and its tabs close. That
 * caller runs the returned `onClosed` sweep; every other one drops the value.
 */
export function terminateRemoteEntry(managers: Managers, entry: RemoteEntry, announce = true): RemoteLaunchHandlers[] {
  if (entry.closed) return [];
  entry.closed = true;
  entry.attach.stop();
  cancelSessionState(entry);
  if (announce) terminateRemoteSession(managers, entry.labels, entry.address.host, 'Remote janus');
  // The muted line carries: a settlement that narrated the ending itself (the sessions tab, a
  // pressed attach) keeps the per-process end lines quiet for the finish sweep below too, so one
  // event is one line however many exits it passes through.
  else entry.announceEnds = false;
  clearRemoteFileCacheForWorkspace(entry.address.host, entry.workspaceLabel);
  const session = entry.channel.sessionId;
  entry.channel.finish();
  entry.channel.closeAfterShutdown();
  const handlers = [...entry.handlers.values()];
  entry.handlers.clear();
  dropTerminatedSessionRecord(managers, session);
  return handlers;
}
