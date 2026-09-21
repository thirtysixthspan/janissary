import type { Managers } from '../managers.js';
import { parseRemoteAddress } from '../remote/address.js';
import type { RemoteSessionRecord } from './store.js';

// Terminating a parked session for good: reconnect far enough to send `shutdown`, which stops its
// processes and removes its remote workspace, then let go.
//
// It opens no tabs. An attach exists to bring a session back and a terminate exists to destroy it, so
// routing a terminate through the attach path would put the tabs on screen for as long as it takes to
// close them again. The channel is opened under a label no tab holds: nothing renders it, and the
// only thing it is used for is the frame that terminates the session.

export type TerminateOutcome =
  | { terminated: true }
  | { terminated: false; reason: string };

// A label no tab can collide with, so the channel this opens is addressable without ever appearing
// in the tab strip. `RemoteManager` keys entries by label alone and asks nothing else of them.
const TERMINATE_LABEL_PREFIX = 'terminate-session:';

function terminateLabel(session: string): string {
  return `${TERMINATE_LABEL_PREFIX}${session}`;
}

// The channel a terminate attempt opens is not a session anyone is attached to — it exists to send one
// frame and go — so `SessionsManager` has to tell it apart from a live entry. Recognized here, beside
// the one place the label is minted, so the two cannot drift.
export function isTerminateSessionLabel(label: string): boolean {
  return label.startsWith(TERMINATE_LABEL_PREFIX);
}

/**
 * A peer that accepts the attach is told to shut down. A peer that refuses one is already gone —
 * which is the same outcome by a shorter route, so it counts as terminated rather than as a failure.
 * Only a connection that never gets an answer leaves the record in place.
 */
export function terminateParkedSession(
  managers: Managers, record: RemoteSessionRecord,
): Promise<TerminateOutcome> {
  const address = parseRemoteAddress(record.address);
  if ('error' in address) return Promise.resolve({ terminated: false, reason: address.error });
  const label = terminateLabel(record.session);

  return new Promise<TerminateOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: TerminateOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    managers.remote.create(label, address, record.workspaceDir, {
      onReady: () => {},
      onFailed: (message) => { finish({ terminated: false, reason: message }); },
      onClosed: () => { finish({ terminated: false, reason: `The connection to ${record.host} closed.` }); },
    }, {
      session: record.session,
      workspaceDir: record.workspaceDir,
      onResult: (accepted: boolean) => {
        // Settle the outcome first: `close` is the explicit-close path — it kills every process on
        // the channel, sends `shutdown`, and runs the launch handlers' `onClosed` sweep
        // synchronously — so letting it speak first would settle this promise as an ordinary
        // connection gone. `settled` makes that sweep a no-op.
        finish({ terminated: true });
        if (accepted) managers.remote.close(label);
      },
      onFailed: (message) => { finish({ terminated: false, reason: message }); },
    });
  });
}
