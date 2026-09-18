import type { Managers } from '../managers.js';
import { parseRemoteAddress } from '../remote/address.js';
import type { RemoteSessionRecord } from './store.js';

// Ending a parked session for good: reconnect far enough to send `shutdown`, which stops its
// processes and removes its remote workspace, then let go.
//
// It opens no tabs. A reattach exists to bring a session back and an end exists to destroy it, so
// routing an end through the reattach path would put the tabs on screen for as long as it takes to
// close them again. The channel is opened under a label no tab holds: nothing renders it, and the
// only thing it is used for is the frame that ends the session.

export type EndOutcome =
  | { ended: true }
  | { ended: false; reason: string };

// A label no tab can collide with, so the channel this opens is addressable without ever appearing
// in the tab strip. `RemoteManager` keys entries by label alone and asks nothing else of them.
const END_LABEL_PREFIX = 'end-session:';

function endLabel(session: string): string {
  return `${END_LABEL_PREFIX}${session}`;
}

// The channel an end attempt opens is not a session anyone is attached to — it exists to send one
// frame and go — so `SessionsManager` has to tell it apart from a live entry. Recognized here, beside
// the one place the label is minted, so the two cannot drift.
export function isEndSessionLabel(label: string): boolean {
  return label.startsWith(END_LABEL_PREFIX);
}

/**
 * A peer that accepts the reattach is told to shut down. A peer that refuses one is already gone —
 * which is the same outcome by a shorter route, so it counts as ended rather than as a failure.
 * Only a connection that never gets an answer leaves the record in place.
 */
export function endParkedSession(
  managers: Managers, record: RemoteSessionRecord,
): Promise<EndOutcome> {
  const address = parseRemoteAddress(record.address);
  if ('error' in address) return Promise.resolve({ ended: false, reason: address.error });
  const label = endLabel(record.session);

  return new Promise<EndOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: EndOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    managers.remote.open(label, address, record.workspaceDir, {
      onReady: () => {},
      onFailed: (message) => { finish({ ended: false, reason: message }); },
      onClosed: () => { finish({ ended: false, reason: `The connection to ${record.host} closed.` }); },
    }, {
      session: record.session,
      workspaceDir: record.workspaceDir,
      onResult: (accepted: boolean) => {
        // Settle the outcome first: `close` is the explicit-close path — it kills every process on
        // the channel, sends `shutdown`, and runs the launch handlers' `onClosed` sweep
        // synchronously — so letting it speak first would settle this promise as an ordinary
        // connection gone. `settled` makes that sweep a no-op.
        finish({ ended: true });
        if (accepted) managers.remote.close(label);
      },
      onFailed: (message) => { finish({ ended: false, reason: message }); },
    });
  });
}
