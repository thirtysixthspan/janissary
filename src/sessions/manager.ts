import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import type { Managers } from '../managers.js';
import type { RemoteSessionAction, RemoteSessionView } from '../protocol.js';
import { resumeRemote } from '../remote/attach.js';
import { runSessionAction, type SessionAction, type SessionActionResult } from './actions.js';
import { isTerminateSessionLabel } from './terminate-session.js';
import { composeSessionRows, type SessionTerminated, type SessionsSnapshot } from './rows.js';
import { channelOf, recordOf, sshTabs } from './snapshot.js';
import {
  loadRemoteSessions, mergeRemoteSession, saveRemoteSessions, withoutRemoteSession,
  type RemoteSessionRecord, type RemoteSessionProcess,
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
  // Sessions with a terminate attempt in flight, by session id. In memory for the same reason `failures`
  // is: it describes this process's attempt, not the session. Cleared however the attempt settles —
  // a flag left set leaves a row permanently claiming to be mid-terminate.
  private terminating = new Set<string>();
  private terminated: SessionTerminated[] = [];
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
  // only by pressing attach or terminate, so a refresh never speaks to a host.
  refresh(): void { this.changed(); }

  detach(label: string): boolean { return this.act({ kind: 'detach', label }); }

  // One verb, two kinds of waiting. A session this janissary is still attached to is mid-backoff, so
  // attaching it means "try now"; a parked one has no transport at all, so it means "bring it
  // back". The row's state already told the user which; the request is the same either way.
  attach(session: string): boolean {
    const live = this.managers.remote.liveEntries()
      .find((entry) => entry.channel.sessionId === session);
    if (live) return this.attachTab(live.workspaceLabel);
    return this.act({ kind: 'attach', session });
  }

  // The metadata row's attach, which addresses a tab rather than a record. On a live entry it
  // means "try now": it collapses the reconnect backoff exactly as the system resume signal does.
  attachTab(label: string): boolean {
    const entry = this.managers.remote.liveEntries().find((candidate) => candidate.labels.has(label));
    // The only way to get here is a tab whose channel has already gone, which is exactly when the
    // user needs telling: a control that declines without a word reads as one that is broken.
    if (!entry) {
      notify(this.managers, 'remote-session', label,
        `${label} cannot be attached — its remote connection is gone.`);
      return false;
    }
    resumeRemote(entry);
    this.changed();
    return true;
  }

  terminate(session: string): boolean { return this.act({ kind: 'terminate', session }); }

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

  // Every parked session, attached independently as part of a `--relaunch` restore. Each runs on
  // its own: a refusing peer is marked terminated and an unreachable host stays detached, and neither
  // holds the restore up, which is why nothing here is awaited.
  restoreAll(): void {
    for (const record of this.all()) this.attach(record.session);
  }

  /**
   * The row that authorises `verb` on `target`, or nothing.
   *
   * A row has to both match the target *and* list the verb among its own actions — the list this
   * manager composed and already publishes. Matching on the name alone was wider than the list that
   * motivates it: a `detached` or `terminated` row's `label` is a recorded name belonging to no live tab,
   * and recorded labels are ordinary harness names like `claude`, so a plugin could send `close` for
   * a row offering only `attach` and take out whatever tab happened to bear that name.
   *
   * The row comes back rather than a boolean so the caller acts on what authorised it instead of
   * searching the tab table again for the same string.
   */
  offers(verb: RemoteSessionAction, target: { label?: string; session?: string }): RemoteSessionView | undefined {
    return this.view().find((row) => (
      row.actions.includes(verb)
      && (target.label === undefined || row.label === target.label)
      && (target.session === undefined || row.session === target.session)
    ));
  }

  recordFor(session: string): RemoteSessionRecord | undefined {
    return this.all().find((record) => record.session === session);
  }

  // The record and process entry naming `label`, if this janissary ever recorded a remote process by
  // that label — the persisted-name resolution `harness capture <name>` falls back to when no open
  // tab matches (decision 15 of the auto-accept-while-detached plan): a Detach closes every tab, so
  // there is nothing for `managers.tab.byLabel` to find, and this is the same record the Sessions
  // tab's detached rows already read.
  recordForProcess(label: string): { record: RemoteSessionRecord; process: RemoteSessionProcess } | undefined {
    for (const record of this.all()) {
      const process = record.processes.find((candidate) => candidate.label === label);
      if (process) return { record, process };
    }
    return undefined;
  }

  // The session is over — its channel reached a genuine end through the remote lifecycle, not
  // through a sessions action narrating itself. The record goes, so the list carries no detached row
  // for a peer that was actually shut down; a session the action layer narrated drops its own record.
  dropSession(session: string): void {
    if (this.all().every((record) => record.session !== session)) return;
    this.records = withoutRemoteSession(this.all(), session);
    this.failures.delete(session);
    this.persist();
    this.changed();
  }

  dispose(): void { this.live.unsubscribe(); this.stamps.clear(); this.terminating.clear(); }

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
  // terminated sets, and the change signal can never disagree about what just happened.
  private apply(result: SessionActionResult): void {
    if (result.drop !== undefined) this.records = withoutRemoteSession(this.all(), result.drop);
    if (result.record !== undefined) this.records = mergeRemoteSession(this.all(), result.record);
    if (result.failure !== undefined) this.failures.set(result.failure.session, result.failure.reason);
    if (result.clearFailure !== undefined) this.failures.delete(result.clearFailure);
    if (result.terminating !== undefined) this.terminating.add(result.terminating);
    if (result.terminatingDone !== undefined) this.terminating.delete(result.terminatingDone);
    if (result.terminated !== undefined) this.terminated = [...this.terminated, result.terminated];
    if (result.forgetTerminated !== undefined) {
      this.terminated = this.terminated.filter((entry) => entry.session !== result.forgetTerminated);
    }
    if (result.ran) this.persist();
    if (result.ran) this.changed();
  }

  private all(): RemoteSessionRecord[] {
    if (!this.loaded) { this.loaded = true; this.records = loadRemoteSessions(); }
    return this.records;
  }

  // Mirror every live channel into the record, so what is written down is always what is running.
  // A session becomes attachable the moment it has a workspace and something in it — there is no
  // separate "remember this" step that a crash could land in front of.
  private mirror(): void {
    const now = Date.now();
    let changed = false;
    for (const entry of this.managers.remote.liveEntries()) {
      if (entry.closed) continue;
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
    // The channel a terminate attempt opens carries the record's session id, but it is nobody's session:
    // it holds no tab, so it composes a member-less group the list drops, and counting its id as live
    // would filter the record out too — between them the row simply vanished for the length of the
    // attempt, which is when the user most needs to see it.
    const channels = this.managers.remote.liveEntries()
      .filter((entry) => !entry.closed)
      .filter((entry) => [...entry.labels].some((label) => !isTerminateSessionLabel(label)))
      .map((entry) => {
        if (entry.channel.sessionId) live.add(entry.channel.sessionId);
        return channelOf(this.managers, entry, activity);
      });
    const detached = this.all()
      .filter((record) => !live.has(record.session))
      .map((record) => {
        const failure = this.failures.get(record.session);
        const terminating = this.terminating.has(record.session);
        return {
          record,
          ...(failure !== undefined && { failure }),
          ...(terminating && { terminating }),
        };
      });
    return { channels, ssh: sshTabs(this.managers, activity), detached, terminated: this.terminated };
  }

  private persist(): void { saveRemoteSessions(this.all()); }

  private changed(): void { messageBus.emit('sessions', { type: 'changed' }); }
}

// Everything but the stamp: a record whose description has not moved should not move its own age.
function sameRecord(a: RemoteSessionRecord, b: RemoteSessionRecord): boolean {
  return JSON.stringify({ ...a, activity: 0 }) === JSON.stringify({ ...b, activity: 0 });
}
