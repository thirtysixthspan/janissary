import { distinctColor, uniqueLabel } from '../tab/index.js';
import type { Managers } from '../managers.js';
import { startRemoteAgent } from '../profile/remote-agent.js';
import { parseRemoteAddress } from '../remote/address.js';
import { askSessionState } from '../remote/resume.js';
import { restoreSessionTabs } from './restore-tabs.js';
import type { RemoteSessionRecord } from './store.js';

// Bringing a parked session back. The launching tab is created first, exactly as a remote launch
// creates it, because it is the placeholder ssh's own password, passphrase, and host-key prompts
// render in — a reattach opens one connection and it authenticates like any other.

export type ReattachOutcome =
  // The peer took it. Its tabs are open.
  | { kind: 'reattached'; label: string }
  // The peer answered and said that session is over, or came back holding nothing. Either way the
  // record describes something that no longer exists, so it is dropped.
  | { kind: 'ended'; reason: string }
  // Nothing was established. The host may be asleep, unreachable, or merely slow; the record stays
  // and the row keeps its reattach button.
  | { kind: 'failed'; reason: string };

// Everything an accepted reattach still has to do: ask what survived, rebuild the rest of the group,
// and end a peer that came back empty. A peer holding a workspace with nothing running in it would
// otherwise sit on its host for a week for no reason (decision 20).
async function settleAccepted(
  managers: Managers, record: RemoteSessionRecord, label: string,
): Promise<ReattachOutcome> {
  const entry = managers.remote.liveEntries().find((candidate) => candidate.labels.has(label));
  if (!entry) return { kind: 'failed', reason: `The connection to ${record.host} closed before it could be read.` };
  const processes = await askSessionState(entry);
  // An accepted peer that cannot say what it is holding cannot be safely restored. End it through
  // the regular remote lifecycle, which closes the placeholder and sends shutdown before its record
  // can leave a remote workspace stranded.
  if (processes === undefined) {
    managers.remote.close(label);
    return { kind: 'ended', reason: `${record.host} accepted the reattach but never said what was running.` };
  }
  if (processes.length === 0) {
    managers.remote.close(label);
    return { kind: 'ended', reason: `${record.launchLabel} on ${record.host} had nothing still running.` };
  }
  restoreSessionTabs(managers, record, label, processes);
  return { kind: 'reattached', label };
}

function harnessNameOf(record: RemoteSessionRecord): string | undefined {
  return record.processes.find((process) => process.label === record.launchLabel)?.harness;
}

function spawnIdOf(record: RemoteSessionRecord): string | undefined {
  return record.processes.find((process) => process.label === record.launchLabel)?.id;
}

/**
 * Reattach the peer this record describes, opening its tabs as its answers arrive.
 *
 * A refused reattach establishes termination — the peer is there and says that session is over — and
 * is reported as ended. A connection that never gets an answer establishes nothing, so it is
 * reported as failed and the record survives to be tried again.
 */
export function startSessionReattach(
  managers: Managers, record: RemoteSessionRecord,
): Promise<ReattachOutcome> {
  const address = parseRemoteAddress(record.address);
  if ('error' in address) return Promise.resolve({ kind: 'failed', reason: address.error });
  const harness = harnessNameOf(record);
  const label = uniqueLabel(managers.tab.tabs, record.launchLabel);

  return new Promise<ReattachOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: ReattachOutcome): void => {
      if (settled) return;
      settled = true;
      // An outcome other than a live reattach leaves no shell bound to the adopted spawn id: ended
      // means the session is over, and a failure means nothing was established — either way the id
      // is dropped so no later tab granted this label can claim it.
      if (outcome.kind !== 'reattached') managers.shell.releaseAdoptedShell(label);
      resolve(outcome);
    };
    const resume = {
      session: record.session,
      workspaceDir: record.workspaceDir,
      onResult: (accepted: boolean) => {
        if (!accepted) {
          finish({ kind: 'ended', reason: `${record.launchLabel} on ${record.host} is no longer running.` });
          return;
        }
        void settleAccepted(managers, record, label).then(finish, () => {
          finish({ kind: 'failed', reason: `${record.host} did not answer.` });
        });
      },
    };

    const resumed = {
      ...resume,
      onFailed: (message: string) => { finish({ kind: 'failed', reason: message }); },
    };

    if (record.launchKind === 'harness' && harness !== undefined) {
      const creator = managers.tab.cur();
      const spawnId = spawnIdOf(record);
      managers.harness.reattachRemote({
        name: harness, label, cwd: record.workspaceDir, workspaceDir: undefined, offline: false,
        group: creator.group, groupColor: creator.groupColor,
        dotColor: distinctColor(managers.tab.tabs.map((tab) => tab.dotColor)),
        autoApprove: false, browser: false, remote: address, resume: resumed,
        ...(spawnId !== undefined && { resumePtyId: spawnId }),
      });
      return;
    }

    // An agent-launched session: the tab is an ordinary agent tab whose shell runs on the far side,
    // and its shell binds to the recorded spawn id the moment something asks for one.
    const spawnId = spawnIdOf(record);
    if (spawnId !== undefined) managers.shell.adoptRemoteShell(label, spawnId, record.session);
    startRemoteAgent(managers, {
      resolved: label, creator: managers.tab.cur(), address, offline: false,
      cwd: record.workspaceDir, resume: resumed,
      out: () => {},
    });
  });
}
