import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications.js';
import { clearRemoteFileCacheForWorkspace } from '../file-navigator/remote-file-cache.js';
import type { RemoteChannel } from './channel.js';
import type { RemoteTranscriptSource } from './transcript-source.js';
import type { RemoteAddress } from './address.js';
import type { RemoteLaunchHandlers } from './manager.js';

export type RemoteEntry = {
  channel: RemoteChannel;
  transcript: RemoteTranscriptSource;
  address: RemoteAddress;
  labels: Set<string>;
  handlers: Map<string, RemoteLaunchHandlers>;
  ready: Promise<string>;
  resolveReady: (dir: string) => void;
  rejectReady: (error: Error) => void;
  workspaceDir?: string;
  settled: boolean;
  closed: boolean;
  workspaceLabel: string;
  reconnect: Reattach;
};

export class Reattach {
  active = false;
  private stopped = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;

  constructor(private connect: () => void, private abort: () => void) {}

  lost(): void {
    if (this.stopped || this.timer) return;
    this.active = true;
    clearTimeout(this.deadline);
    this.timer = setTimeout(() => this.retry(), Math.min(250 * 2 ** Math.min(this.attempt++, 7), 30_000));
  }

  retry(): void {
    if (this.stopped || !this.active) return;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = undefined;
    this.deadline = setTimeout(() => { this.abort(); this.lost(); }, 15_000);
    try { this.connect(); } catch { this.lost(); }
  }

  accepted(): void {
    this.active = false;
    this.attempt = 0;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = undefined;
  }

  stop(): void { this.accepted(); this.stopped = true; }
}

// Only an entry already mid-backoff after losing its transport benefits from a resume: it has
// something to collapse the wait on. An attached channel's transport is healthy by definition — a
// resume signal has nothing to fix there, so forcing a replacement would only discard an
// unbuffered PTY gap for no reason.
export function resumeRemote(entry: RemoteEntry): void {
  if (entry.closed || !entry.channel.sessionId || !entry.workspaceDir || !entry.reconnect.active) return;
  entry.reconnect.retry();
}

// Marks and notifies the affected tabs only — it does not clear the workspace's local file cache,
// since a per-process end (`endRemoteProcess`) does not necessarily mean the session is over. Only
// `terminateRemoteEntry`, the genuine end of the shared workspace, clears the cache.
export function endRemoteSession(managers: Managers, labels: Iterable<string>, host: string, what: string): void {
  const text = `${what} on ${host} ended — start a new agent or shell to continue.`;
  let notified = false;
  for (const label of labels) {
    const tab = managers.tab.byLabel(label);
    if (!tab) continue;
    if (tab.sessionEnded) continue;
    tab.sessionEnded = text;
    if (tab.harness) {
      tab.harness.status = 'exited';
      tab.harness.sessionEnded = text;
    } else {
      tab.log = [...tab.log, { input: '', output: text }];
      if (tab.runtime) tab.runtime.busy = false;
    }
    if (!notified) { notify(managers, 'remote-session-ended', label, text); notified = true; }
  }
  messageBus.emit('state', { type: 'dirty' });
}

export function endRemoteProcess(managers: Managers, entry: RemoteEntry, label: string, harness: boolean): void {
  endRemoteSession(managers, [label], entry.address.host, harness ? `Remote harness '${label}'` : 'Remote shell');
  const live = [...entry.labels].some((owner) => {
    const tab = managers.tab.byLabel(owner);
    return tab && tab.view !== 'files' && !tab.sessionEnded;
  });
  if (!live) terminateRemoteEntry(managers, entry, false);
}

export function terminateRemoteEntry(managers: Managers, entry: RemoteEntry, announce = true): void {
  if (entry.closed) return;
  entry.closed = true;
  entry.reconnect.stop();
  if (announce) endRemoteSession(managers, entry.labels, entry.address.host, 'Remote janus');
  clearRemoteFileCacheForWorkspace(entry.address.host, entry.workspaceLabel);
  entry.channel.finish();
  entry.channel.close();
  entry.handlers.clear();
}
