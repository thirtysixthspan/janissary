import type { RemoteSessionAction, RemoteSessionKind, RemoteSessionView } from '../protocol.js';
import type { RemoteProcessKind, RemoteSessionRecord } from './store.js';

// Composing the sessions list, as a pure function of a snapshot. Everything effectful — reading
// `RemoteManager`, reading `TabManager`, reading the record file — happens in the manager beside
// this; what arrives here is data, so the ordering, the grouping, and which actions each row offers
// are testable without a server (principle 4).

// One tab riding a live channel: a remote harness, a remote agent, or a remote file navigator.
export type SessionMember = {
  label: string;
  name: string;
  kind: RemoteSessionKind;
  activity: number;
};

// One live channel, with the tab that launched it first.
export type SessionChannel = {
  launchLabel: string;
  host: string;
  destination: string;
  workspace: string;
  session?: string;
  // No workspace clone has landed yet, so there is nothing to come back to and nothing to detach.
  provisioning: boolean;
  // The transport is gone and the backoff is already running.
  reconnecting: boolean;
  members: SessionMember[];
};

// A plain `ssh <destination>` tab: a local PTY running the real ssh binary, with no janissary peer
// behind it, so it is listed but never detached or attached.
export type SessionSsh = {
  label: string;
  host: string;
  destination: string;
  activity: number;
};

// A record with no live channel, plus what the last attempt on it reported. The failure is what
// earns the row its trash button.
export type SessionDetached = {
  record: RemoteSessionRecord;
  failure?: string;
  // A terminate attempt on this session is running. The row stays on screen for the duration, saying so,
  // rather than disappearing until the host answers.
  terminating?: boolean;
};

// A session a refused attach or an emptied peer established is over. Its record is already gone;
// the row stays so the user reads what happened rather than watching a row vanish.
export type SessionTerminated = {
  session: string;
  host: string;
  destination: string;
  workspace: string;
  label: string;
  name: string;
  kind: RemoteProcessKind;
  activity: number;
};

export type SessionsSnapshot = {
  channels: SessionChannel[];
  ssh: SessionSsh[];
  detached: SessionDetached[];
  terminated: SessionTerminated[];
};

function liveState(channel: SessionChannel): RemoteSessionView['state'] {
  if (channel.provisioning) return 'provisioning';
  return channel.reconnecting ? 'reconnecting' : 'active';
}

// The launching row of a live channel is where the channel-level verbs live, because a detach acts
// on the whole channel: one ssh connection serves every tab riding it, so a per-tab detach would
// have to keep the connection up for the others and would mean nothing. On a channel that cannot
// present its launching row — its tab was closed while the joined ones keep the channel alive —
// those verbs belong on every surviving row: each is by definition a survivor, and the rows are a
// view of one thing.
//
// `detach` is offered even while provisioning. The row's state is what says it cannot be pressed
// yet, so the control stays where the eye expects it rather than appearing once the clone lands.
//
// A reconnecting row gains `attach`, where it means "try now": the transport is gone and the
// backoff is already running, so pressing it collapses the wait exactly as the system resume signal
// does. It is the same verb as a parked session's because it is the same request — bring this back —
// and the row's state is what says which kind of waiting it ends.
function liveActions(launching: boolean, reconnecting: boolean): RemoteSessionAction[] {
  if (!launching) return ['focus', 'close'];
  return reconnecting ? ['focus', 'attach', 'detach'] : ['focus', 'detach'];
}

function liveRows(channel: SessionChannel): RemoteSessionView[] {
  const state = liveState(channel);
  const launchAbsent = channel.members.every((member) => member.label !== channel.launchLabel);
  return channel.members.map((member) => ({
    id: member.label,
    host: channel.host,
    name: member.name,
    kind: member.kind,
    state,
    activity: member.activity,
    destination: channel.destination,
    workspace: channel.workspace,
    joined: member.label !== channel.launchLabel,
    actions: liveActions(launchAbsent || member.label === channel.launchLabel, state === 'reconnecting'),
    label: member.label,
    ...(channel.session !== undefined && { session: channel.session }),
  }));
}

function sshRow(tab: SessionSsh): RemoteSessionView {
  return {
    id: tab.label,
    host: tab.host,
    name: 'ssh',
    kind: 'ssh',
    state: 'active',
    activity: tab.activity,
    destination: tab.destination,
    workspace: '',
    joined: false,
    actions: ['focus', 'close'],
    label: tab.label,
  };
}

// `terminate` and `forget` sit on the launching row alone, for the same reason `detach` does: both act on
// the whole peer. `attach` is the deliberate exception — pressing it on any row brings the whole
// session back, because one ssh connection serves all of them and the rows are a view of one thing.
function detachedActions(launching: boolean, failed: boolean): RemoteSessionAction[] {
  if (!launching) return ['attach'];
  return failed ? ['attach', 'terminate', 'forget'] : ['attach', 'terminate'];
}

function detachedRows(entry: SessionDetached): RemoteSessionView[] {
  const { record, failure, terminating } = entry;
  return record.processes.map((process) => ({
    id: `${record.session}:${process.id}`,
    host: record.host,
    name: process.label,
    kind: process.kind,
    state: 'detached' as const,
    activity: record.activity,
    destination: record.destination,
    workspace: record.workspaceDir,
    joined: process.label !== record.launchLabel,
    actions: detachedActions(process.label === record.launchLabel, failure !== undefined),
    label: process.label,
    session: record.session,
    ...(failure !== undefined && { failure }),
    ...(terminating === true && { terminating: true }),
  }));
}

function terminatedRow(entry: SessionTerminated): RemoteSessionView {
  return {
    id: `${entry.session}:terminated`,
    host: entry.host,
    name: entry.name,
    kind: entry.kind,
    state: 'terminated',
    activity: entry.activity,
    destination: entry.destination,
    workspace: entry.workspace,
    joined: false,
    // Nothing is left to act on out there, so the only thing on offer is clearing the row.
    actions: ['forget'],
    label: entry.label,
    session: entry.session,
  };
}

/**
 * The list, newest first. Ordering applies to the launching rows alone and each group's members stay
 * under theirs, so one glance shows what a single detach would take with it — sorting every row by
 * its own activity would scatter a group across the list and hide exactly that.
 */
export function composeSessionRows(snapshot: SessionsSnapshot): RemoteSessionView[] {
  const groups: { activity: number; rows: RemoteSessionView[] }[] = [
    ...snapshot.channels.map((channel) => ({ activity: leadActivity(channel), rows: liveRows(channel) })),
    ...snapshot.ssh.map((tab) => ({ activity: tab.activity, rows: [sshRow(tab)] })),
    ...snapshot.detached.map((entry) => ({ activity: entry.record.activity, rows: detachedRows(entry) })),
    ...snapshot.terminated.map((entry) => ({ activity: entry.activity, rows: [terminatedRow(entry)] })),
  ];
  return groups
    .filter((group) => group.rows.length > 0)
    .toSorted((a, b) => b.activity - a.activity)
    .flatMap((group) => group.rows);
}

// A group is as recent as its launching row, which is the row the ordering is about.
function leadActivity(channel: SessionChannel): number {
  const lead = channel.members.find((member) => member.label === channel.launchLabel);
  return lead?.activity ?? channel.members[0]?.activity ?? 0;
}
