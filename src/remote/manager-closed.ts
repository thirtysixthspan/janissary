import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { dropRemoteLabels, markEntryEnded, type RemoteEntry } from './attach.js';

/**
 * A channel's transport went away, or its last label let it go. Split out of `RemoteManager` to keep
 * that file under the size limit, and written over the entry table it mutates rather than over the
 * manager, so the one thing it needs from the manager is visible in its signature.
 *
 * An established session — one with a session id and a workspace — treats a lost transport as
 * recoverable and hands it to the recovery backoff instead, because the peer on the far side is still
 * there holding both. `ending` says the entry is ending on purpose (the last label released it), so
 * there is nothing to recover. Everything below that branch is the genuine end: readiness is settled
 * or rejected, the entry is marked ended (`markEntryEnded`), it leaves the table, and every tab and
 * navigator holding it hears `onClosed`.
 */
export function remoteChannelClosed(
  managers: Managers, entries: Map<string, RemoteEntry>, entry: RemoteEntry, ending = false,
): void {
  if (entry.closed) return;
  if (!ending && entry.channel.sessionId && entry.workspaceDir) { entry.attach.lost(); return; }
  const handlers = markEntryEnded(entry);
  if (!entry.settled) {
    entry.settled = true;
    entry.rejectReady(new Error(`Remote session to ${entry.address.host} ended before its workspace was ready.`));
  } else if (entry.workspaceDir && entry.labels.size > 0) {
    notify(managers, 'remote-session-terminated', entry.labels.values().next().value!,
      `Remote janus on ${entry.address.host} terminated.`);
  }
  dropRemoteLabels(entries, entry);
  for (const handler of handlers) handler.onClosed();
}
