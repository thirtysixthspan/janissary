import type { Managers } from '../managers.js';
import type { RemoteSessionKind } from '../protocol.js';
import type { RemoteEntry } from '../remote/attach.js';
import type { Tab } from '../tab/types.js';
import { isFilesTab, isSshTab } from '../tab/view-guards.js';
import type { SessionChannel, SessionMember, SessionSsh } from './rows.js';
import type { RemoteProcessKind, RemoteSessionProcess, RemoteSessionRecord } from './store.js';

// Reading the live world: `RemoteManager`'s channels and `TabManager`'s tabs, turned into the plain
// snapshot `composeSessionRows` consumes and the record the store writes. Everything effectful about
// the list is here, so the composition next door stays a pure function of data.

// What a tab is, for the row's third column: what it *is*, matching the tab it opens or would open.
function tabKind(tab: Tab): RemoteSessionKind {
  if (tab.view === 'files') return 'navigator';
  if (tab.view === 'harness') return 'harness';
  return 'agent';
}

// The second column: the tab's own name. A navigator shows its root in the abbreviated form the
// metadata row already uses, so a navigator over a workspace reads as `$workspace/<name>` rather
// than as an absolute path nobody recognizes.
function tabName(tab: Tab): string {
  if (isFilesTab(tab)) return `files ${tab.files.root}`;
  return tab.title ?? tab.label;
}

function memberOf(managers: Managers, label: string, activity: number): SessionMember | undefined {
  const tab = managers.tab.byLabel(label);
  if (!tab) return;
  return { label, name: tabName(tab), kind: tabKind(tab), activity };
}

/**
 * One live channel. The launching row comes first and every joined tab and navigator follows, in the
 * order the entry acquired them — which is the order they were opened, so a group reads the way it
 * was built. A label whose tab has since closed contributes nothing.
 */
export function channelOf(
  managers: Managers, entry: RemoteEntry, activity: (label: string) => number,
): SessionChannel {
  const launchLabel = entry.workspaceLabel;
  const ordered = [launchLabel, ...[...entry.labels].filter((label) => label !== launchLabel)];
  const members = ordered
    .map((label) => memberOf(managers, label, activity(label)))
    .filter((member): member is SessionMember => member !== undefined);
  return {
    launchLabel,
    host: entry.address.host,
    destination: entry.address.destination,
    workspace: entry.workspaceDir ?? '',
    provisioning: entry.workspaceDir === undefined,
    reconnecting: entry.attach.active,
    members,
    ...(entry.channel.sessionId !== undefined && { session: entry.channel.sessionId }),
  };
}

export function sshTabs(managers: Managers, activity: (label: string) => number): SessionSsh[] {
  return managers.tab.tabs.filter((tab) => isSshTab(tab)).map((tab) => ({
    label: tab.label,
    host: tab.harness?.destination?.replace(/^[^@]*@/, '') ?? '',
    destination: tab.harness?.destination ?? '',
    activity: activity(tab.label),
  }));
}

// A harness process is the tab that launched the channel; a `pipe` process is a joined agent tab's
// shell, whose spawn frame already carries that tab's label as its agent name. Anything else — a PTY
// takeover, an inline terminal card — belongs to a tab that is already listed and contributes no row
// of its own.
function processOf(
  state: { id: string; mode: 'pty' | 'pipe'; harness?: string; agentName?: string; autoApprove?: boolean },
  launchLabel: string,
): RemoteSessionProcess | undefined {
  if (state.harness !== undefined) {
    return {
      id: state.id, label: launchLabel, kind: 'harness' as RemoteProcessKind, harness: state.harness,
      ...(state.autoApprove !== undefined && { autoApprove: state.autoApprove }),
    };
  }
  if (state.mode === 'pipe' && state.agentName !== undefined) {
    return { id: state.id, label: state.agentName, kind: 'agent' as RemoteProcessKind };
  }
  return undefined;
}

/**
 * The record for one live channel, or nothing when there is not yet a session worth remembering — a
 * channel still provisioning has no workspace to come back to, one the far side gave no id for
 * cannot be named in an attach, and one that has spawned nothing cannot be attached at all.
 *
 * That last case is the deliberate one. `session-state` is answered from `RemoteProcesses.states()`,
 * which reports spawned processes only, so a peer holding nothing but an ACP session answers an
 * empty list — and `settleAccepted` in `src/sessions/attach.ts` reads an empty answer as "nothing
 * still running", shuts the peer down, and calls the session terminated. Recording such a session would
 * put a row on screen whose attach button destroys the session it names, which is worse than the
 * row's absence. `detach` in `src/sessions/actions.ts` refuses it instead, and says why.
 *
 * Written from what the channel actually spawned rather than from the tabs on screen, so the record
 * describes the far side in the same terms the far side answers a `session-state` query with.
 */
export function recordOf(entry: RemoteEntry, now: number): RemoteSessionRecord | undefined {
  const session = entry.channel.sessionId;
  if (session === undefined || entry.workspaceDir === undefined) return;
  const launchLabel = entry.workspaceLabel;
  const processes = entry.channel.spawnedProcesses()
    .map((state) => processOf(state, launchLabel))
    .filter((process): process is RemoteSessionProcess => process !== undefined);
  if (processes.length === 0) return;
  return {
    session,
    address: entry.address.address,
    destination: entry.address.destination,
    host: entry.address.host,
    workspaceLabel: launchLabel,
    workspaceDir: entry.workspaceDir,
    launchLabel,
    launchKind: processes.find((process) => process.label === launchLabel)?.kind ?? 'harness',
    processes,
    activity: now,
  };
}
