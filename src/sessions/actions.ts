import type { Managers } from '../managers.js';
import { notify } from '../notifications.js';
import { errorText } from '../error-text.js';
import type { RemoteEntry } from '../remote/attach.js';
import { terminateParkedSession } from './terminate-session.js';
import { startSessionAttach } from './attach.js';
import type { SessionTerminated } from './rows.js';
import type { RemoteSessionRecord } from './store.js';

// The sessions plugin's own id, which is what its open tab (if any) carries. Its label is what the
// attribution resolves to.
const PLUGIN_ID = 'sessions';

// The four things a row can be asked to do, and the one shape they all answer in. An action never
// touches the manager's state directly: it returns what changed and the manager applies it, so the
// record file, the failure set, and the change signal can never disagree about what just happened.

export type SessionAction =
  | { kind: 'detach'; label: string }
  | { kind: 'attach'; session: string }
  | { kind: 'terminate'; session: string }
  | { kind: 'forget'; session: string };

export type SessionActionResult = {
  // Whether anything happened at all. A `false` is an action naming something the view does not
  // hold, which is a refusal rather than a failure.
  ran: boolean;
  record?: RemoteSessionRecord;
  drop?: string;
  failure?: { session: string; reason: string };
  clearFailure?: string;
  // A terminate attempt started on this session, and settled on it. Raised before the attempt is awaited
  // so the row never renders without it, and cleared on every exit — a row left claiming to be
  // mid-terminate is exactly as misleading as the vanished row this replaced.
  terminating?: string;
  terminatingDone?: string;
  terminated?: SessionTerminated;
  forgetTerminated?: string;
};

export type ApplyResult = (result: SessionActionResult) => void;

// What the notification lines call a session: the name the row's second column shows.
function line(what: string, host: string, text: string): string {
  return `${what} on ${host} ${text}`;
}

// The tab a session line is attributed to, so the feed's provenance header names the surface the
// change belongs to rather than whatever the user happens to be reading: the sessions tab when one
// is open, the active tab otherwise.
function attribution(managers: Managers): string {
  const open = managers.tab.tabs.find((tab) => tab.plugin?.id === PLUGIN_ID);
  return open?.label ?? managers.tab.cur().label;
}

function report(managers: Managers, text: string): void {
  notify(managers, 'remote-session', attribution(managers), text);
}

const REFUSED: SessionActionResult = { ran: false };

/**
 * Park a live session on its host. The order is the whole of it: `RemoteManager.detach` takes the
 * entry out of its table *before* the tabs close, so the tab-close walk's own release finds nothing
 * and cannot send the `kill` and `shutdown` frames a detach exists to withhold.
 */
// What a parked session was, read out before it is parked: `RemoteManager.detach` empties the
// entry's label set as it takes it out of its table, and that set is the list of tabs to close.
// Undefined when the detach was refused — a session still provisioning has nothing to come back to.
function park(
  managers: Managers, entry: RemoteEntry, label: string,
): { held: string[]; host: string; what: string } | undefined {
  const held = [...entry.labels];
  const host = entry.address.host;
  const what = entry.workspaceLabel;
  return managers.remote.detach(label) ? { held, host, what } : undefined;
}

// Why a live channel has no record, in the user's terms. These are the three things `recordOf`
// declines for, and they read differently: one is a wait, one is a fault, one is a session there
// would be no way to describe.
function detachRefusal(entry: RemoteEntry): string {
  if (entry.workspaceDir === undefined) return 'cannot be detached yet — its workspace is still being prepared.';
  if (!entry.channel.sessionId) return 'cannot be detached — the host never named the session.';
  return 'cannot be detached — nothing is running in its workspace to come back to.';
}

function detach(managers: Managers, record: RemoteSessionRecord | undefined, label: string): SessionActionResult {
  const entry = managers.remote.liveEntries().find((candidate) => candidate.labels.has(label));
  if (!entry) return REFUSED;
  // Refused before anything is dropped. A session parked with no record left the peer holding its
  // workspace on the far side for the whole seven-day expiry with no row, no attach path, and
  // nothing to terminate it by — the invisible infrastructure this feature exists to remove.
  if (!record) {
    report(managers, line(entry.workspaceLabel, entry.address.host, detachRefusal(entry)));
    return REFUSED;
  }
  const parked = park(managers, entry, label);
  if (!parked) return REFUSED;
  for (const owner of parked.held) {
    const index = managers.tab.findIndex(owner);
    if (index !== -1) managers.tab.closeTab(index);
  }
  report(managers, line(parked.what, parked.host, 'detached — attach it from the sessions tab.'));
  return { ran: true, record: { ...record, activity: Date.now() }, clearFailure: record.session };
}

function terminatedRowFrom(record: RemoteSessionRecord): SessionTerminated {
  return {
    session: record.session,
    host: record.host,
    destination: record.destination,
    workspace: record.workspaceDir,
    label: record.launchLabel,
    name: record.launchLabel,
    kind: record.launchKind,
    activity: Date.now(),
  };
}

/**
 * Bring a parked session back, and answer for it afterwards. The outcome arrives long after this
 * returns — an ssh connection has to authenticate first — so what is applied here is only "an
 * attempt started"; the rest is applied when the peer answers, or fails to.
 */
function attach(managers: Managers, record: RemoteSessionRecord, apply: ApplyResult): SessionActionResult {
  const failed = (reason: string): void => {
    report(managers, line(record.launchLabel, record.host, `could not be attached: ${reason}`));
    apply({ ran: true, failure: { session: record.session, reason } });
  };
  void startSessionAttach(managers, record).then((outcome) => {
    if (outcome.kind === 'attached') {
      report(managers, line(record.launchLabel, record.host, 'attached.'));
      apply({ ran: true, clearFailure: record.session });
      return;
    }
    if (outcome.kind === 'terminated') {
      report(managers, line(record.launchLabel, record.host, 'terminated.'));
      apply({ ran: true, drop: record.session, clearFailure: record.session, terminated: terminatedRowFrom(record) });
      return;
    }
    // Nothing was established: the host may be asleep, unreachable, or merely slow. The record
    // survives, the row keeps its attach button, and the reason lands on the row.
    failed(outcome.reason);
  }, (error: unknown) => { failed(errorText(error)); });
  return { ran: true };
}

/**
 * Terminate a parked session, and keep its row on screen while that runs.
 *
 * The attempt has to reconnect to the host before it can say anything, which on a slow or unreachable
 * one is minutes. The row stays, marked as terminating: a row that disappeared for the duration read as a
 * completed terminate, and reappeared later holding a workspace the user believed was gone.
 */
function terminate(managers: Managers, record: RemoteSessionRecord, apply: ApplyResult): SessionActionResult {
  void terminateParkedSession(managers, record).then((outcome) => {
    if (outcome.terminated) {
      report(managers, line(record.launchLabel, record.host, 'terminated.'));
      apply({
        ran: true, drop: record.session, clearFailure: record.session,
        terminatingDone: record.session, terminated: terminatedRowFrom(record),
      });
      return;
    }
    apply({
      ran: true, terminatingDone: record.session,
      failure: { session: record.session, reason: outcome.reason },
    });
  });
  return { ran: true, terminating: record.session };
}

// Forgetting removes janissary's own record and touches nothing on the far side.
function forget(managers: Managers, session: string, record: RemoteSessionRecord | undefined): SessionActionResult {
  if (record) report(managers, line(record.launchLabel, record.host, 'forgotten — its record was removed.'));
  return { ran: true, drop: session, clearFailure: session, forgetTerminated: session };
}

export function runSessionAction(
  managers: Managers,
  sessions: { recordFor: (session: string) => RemoteSessionRecord | undefined },
  action: SessionAction,
  apply: ApplyResult,
): SessionActionResult {
  if (action.kind === 'detach') {
    const entry = managers.remote.liveEntries().find((candidate) => candidate.labels.has(action.label));
    const session = entry?.channel.sessionId;
    return detach(managers, session === undefined ? undefined : sessions.recordFor(session), action.label);
  }
  const record = sessions.recordFor(action.session);
  if (action.kind === 'forget') return forget(managers, action.session, record);
  if (!record) return REFUSED;
  return action.kind === 'attach' ? attach(managers, record, apply) : terminate(managers, record, apply);
}
