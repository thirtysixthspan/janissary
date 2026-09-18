import { messageBus } from '../bus.js';
import { notify } from '../notifications.js';
import type { Managers } from '../managers.js';
import type { RemoteSessionView } from '../protocol.js';
import { resumeRemote } from '../remote/reattach.js';
import { runSessionAction, type SessionAction, type SessionActionResult } from './actions.js';
import { composeSessionRows, type SessionEnded, type SessionsSnapshot } from './rows.js';
import { channelOf, recordOf, sshTabs } from './snapshot.js';
import {
  loadRemoteSessions, mergeRemoteSession, saveRemoteSessions, withoutRemoteSession,
  type RemoteSessionRecord,
} from './store.js';

// The remote sessions this janissary holds: the live ones it is attached to, the parked ones it
// could come back to, and the ones it has established are over. It owns the record file, composes
// the list, and runs the four actions the rows offer.
//
// It holds no per-tab resource of its own — every tab in the list belongs to another manager — which
// is why it has no `closeTab` and no entry in `MANAGER_TAB_RELEASE`.

export class SessionsManager {
  private records: RemoteSessionRecord[] = [];
  private loaded = false;
  // What the last attempt on a parked session reported, by session id. Kept in memory rather than in
  // the record: it describes this process's experience of a host, not the session.
  private failures = new Map<string, string>();
  private ended: SessionEnded[] = [];
  // When each row was first seen. A remote session has no cheap per-byte activity signal — output
  // arrives per keystroke, and stamping on it would make this a high-frequency broadcast (principle
  // 8) — so what the column reports is when the session last changed state.
  private stamps = new Map<string, number>();
  // The record follows what is live, so it is written when the live set moves rather than when
  // someone happens to read the list. `RemoteManager` raises this on every channel transition — a
  // launch, a join, a spawn, an exit, a release, a park, a lost transport — so a session opened with
  // this tab shut is recorded all the same, and an open tab needs no Refresh to notice. `mirror`
  // raises nothing itself, so an action's own change signal re-enters it once and stops.
  private live = messageBus.on('sessions', 'changed', () => this.mirror());

  constructor(private managers: Managers) {}

  view(): RemoteSessionView[] {
    this.mirror();
    return composeSessionRows(this.snapshot());
  }

  // Re-read local state and rebuild the rows. It opens no ssh connection: reachability is learned
  // only by pressing reattach or end, so a refresh never speaks to a host.
  refresh(): void { this.changed(); }

  detach(label: string): boolean { return this.act({ kind: 'detach', label }); }

  // One verb, two kinds of waiting. A session this janissary is still attached to is mid-backoff, so
  // reattaching it means "try now"; a parked one has no transport at all, so it means "bring it
  // back". The row's state already told the user which; the request is the same either way.
  reattach(session: string): boolean {
    const live = this.managers.remote.liveEntries()
      .find((entry) => entry.channel.sessionId === session);
    if (live) return this.reattachTab(live.workspaceLabel);
    return this.act({ kind: 'reattach', session });
  }

  // The metadata row's reattach, which addresses a tab rather than a record. On a live entry it
  // means "try now": it collapses the reconnect backoff exactly as the system resume signal does.
  reattachTab(label: string): boolean {
    const entry = this.managers.remote.liveEntries().find((candidate) => candidate.labels.has(label));
    // The only way to get here is a tab whose channel has already gone, which is exactly when the
    // user needs telling: a control that declines without a word reads as one that is broken.
    if (!entry) {
      notify(this.managers, 'remote-session', label,
        `${label} cannot be reattached — its remote connection is gone.`);
      return false;
    }
    resumeRemote(entry);
    this.changed();
    return true;
  }

  end(session: string): boolean { return this.act({ kind: 'end', session }); }

  forget(session: string): boolean { return this.act({ kind: 'forget', session }); }

  focus(label: string): boolean {
    const index = this.managers.tab.findIndex(label);
    if (index === -1) return false;
    this.managers.tab.setActiveTab(index);
    return true;
  }

  close(label: string): boolean {
    const index = this.managers.tab.findIndex(label);
    if (index === -1) return false;
    this.managers.tab.closeTab(index);
    this.changed();
    return true;
  }

  // Every parked session, reattached independently as part of a `--relaunch` restore. Each runs on
  // its own: a refusing peer is marked ended and an unreachable host stays detached, and neither
  // holds the restore up, which is why nothing here is awaited.
  restoreAll(): void {
    for (const record of this.all()) this.reattach(record.session);
  }

  // Whether a session id or a tab label names something the current view holds. Every action is
  // refused for anything else, which keeps the grant as narrow as the list that motivates it.
  holds(target: { label?: string; session?: string }): boolean {
    return this.view().some((row) => (
      (target.label === undefined || row.label === target.label)
      && (target.session === undefined || row.session === target.session)
    ));
  }

  recordFor(session: string): RemoteSessionRecord | undefined {
    return this.all().find((record) => record.session === session);
  }

  dispose(): void { this.live.unsubscribe(); this.stamps.clear(); }

  private act(action: SessionAction): boolean {
    // Every verb resolves a record, and the record has to describe what is live *now* rather than
    // what the last read of the list happened to see. A detach raised from a tab's metadata row
    // never composes the list at all, and parking a session with no record written would leave the
    // peer holding its workspace on its host with nothing able to list it or reach it.
    this.mirror();
    const result = runSessionAction(this.managers, this, action, (later) => this.apply(later));
    this.apply(result);
    return result.ran;
  }

  // Everything an action changed, applied in one place so the record file, the in-memory failure and
  // ended sets, and the change signal can never disagree about what just happened.
  private apply(result: SessionActionResult): void {
    if (result.drop !== undefined) this.records = withoutRemoteSession(this.all(), result.drop);
    if (result.record !== undefined) this.records = mergeRemoteSession(this.all(), result.record);
    if (result.failure !== undefined) this.failures.set(result.failure.session, result.failure.reason);
    if (result.clearFailure !== undefined) this.failures.delete(result.clearFailure);
    if (result.ended !== undefined) this.ended = [...this.ended, result.ended];
    if (result.forgetEnded !== undefined) {
      this.ended = this.ended.filter((entry) => entry.session !== result.forgetEnded);
    }
    if (result.ran) this.persist();
    if (result.ran) this.changed();
  }

  private all(): RemoteSessionRecord[] {
    if (!this.loaded) { this.loaded = true; this.records = loadRemoteSessions(); }
    return this.records;
  }

  // Mirror every live channel into the record, so what is written down is always what is running.
  // A session becomes reattachable the moment it has a workspace and something in it — there is no
  // separate "remember this" step that a crash could land in front of.
  private mirror(): void {
    const now = Date.now();
    let changed = false;
    for (const entry of this.managers.remote.liveEntries()) {
      const record = recordOf(entry, now);
      if (!record) continue;
      const existing = this.all().find((candidate) => candidate.session === record.session);
      // The stamp moves only when the description does, so a row's age reports when the session last
      // changed rather than being reset by every read of the list.
      const stamped = { ...record, activity: existing ? existing.activity : now };
      if (existing && sameRecord(existing, stamped)) continue;
      this.records = mergeRemoteSession(this.all(), existing ? { ...stamped, activity: now } : stamped);
      changed = true;
    }
    if (changed) this.persist();
  }

  private snapshot(): SessionsSnapshot {
    const live = new Set<string>();
    const activity = (label: string): number => {
      const stamp = this.stamps.get(label) ?? Date.now();
      this.stamps.set(label, stamp);
      return stamp;
    };
    const channels = this.managers.remote.liveEntries().map((entry) => {
      if (entry.channel.sessionId) live.add(entry.channel.sessionId);
      return channelOf(this.managers, entry, activity);
    });
    const detached = this.all()
      .filter((record) => !live.has(record.session))
      .map((record) => {
        const failure = this.failures.get(record.session);
        return failure === undefined ? { record } : { record, failure };
      });
    return { channels, ssh: sshTabs(this.managers, activity), detached, ended: this.ended };
  }

  private persist(): void { saveRemoteSessions(this.all()); }

  private changed(): void { messageBus.emit('sessions', { type: 'changed' }); }
}

// Everything but the stamp: a record whose description has not moved should not move its own age.
function sameRecord(a: RemoteSessionRecord, b: RemoteSessionRecord): boolean {
  return JSON.stringify({ ...a, activity: 0 }) === JSON.stringify({ ...b, activity: 0 });
}
