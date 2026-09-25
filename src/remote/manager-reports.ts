import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import type { RemoteEntry } from './attach.js';

// What a channel has to say to the tabs riding it, kept out of `RemoteManager` so the manager holds
// the channel lifecycle and these hold the wording. Both are "something happened out there and the
// tab that cares is not the one the channel is labelled with".

/**
 * A remote `-b` tab's browser is gone. The tab is resolved from the frame's session id rather than
 * from the channel's label, because joined tabs share a channel and the channel label would name the
 * wrong one. A frame for an already-closed tab is dropped.
 *
 * Delivered onto the tab as well as into the notifications tab, for the same reason the local path
 * does it: the agent that was driving the browser is working in that tab, and a notification is
 * worth nothing to a user who keeps the feed closed.
 */
export function notifyBrowserGone(managers: Managers, sessionId: string, message?: string): void {
  const tab = managers.tab.harnessTabByPtyId(sessionId);
  if (!tab?.harness) return;
  const text = message ?? 'e2e browser stopped on the remote host';
  notify(managers, 'e2e-browser-gone', tab.label, text);
  tab.harness.browserError = text;
  messageBus.emit('state', { type: 'dirty' });
}

/**
 * The remote host refused a request after the entry settled. The far side reports every refusal as
 * `workspace-failed`, but once the workspace is ready that frame no longer means provisioning failed:
 * the session is alive and one request was turned away — most often a frame type a peer on an older
 * protocol does not know. So the tab stays open and the refusal goes to the notifications feed, on
 * the entry's first remaining label, since a harness tab's body is its PTY and nothing renders its log.
 */
export function reportRemoteRefusal(managers: Managers, entry: RemoteEntry, message: string): void {
  const label = entry.labels.values().next().value;
  if (label === undefined) return;
  notify(managers, 'remote-refused', label, `Remote janus on ${entry.address.host} refused a request: ${message}`);
}

/**
 * The detached peer's replay buffer overflowed and dropped its oldest frames. A harness tab's body
 * is its PTY and nothing renders `tab.log` there, so only a non-harness (agent) tab gets a visible
 * line — the same reasoning `terminateRemoteSession`'s non-harness branch already uses.
 */
export function reportTruncatedReplay(managers: Managers, entry: RemoteEntry): void {
  for (const label of entry.labels) {
    const tab = managers.tab.byLabel(label);
    if (!tab || tab.harness) continue;
    tab.log = [...tab.log, { input: '', output: 'Some remote output produced while disconnected was dropped to limit memory use.' }];
  }
  messageBus.emit('state', { type: 'dirty' });
}
