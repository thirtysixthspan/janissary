import { messageBus } from '../bus.js';
import { getProjectTokens } from '../project/tokens.js';
import { getGitIdentity } from '../git/identity.js';
import type { Managers } from '../managers.js';
import type { PtySession } from '../pty.js';
import type { RemoteAddress } from './address.js';
import { RemoteChannel } from './channel.js';
import { createRemoteTranscriptSource, type RemoteTranscriptSource } from './transcript-source.js';
import { notify } from '../notifications.js';
import { clearRemoteFileCacheForWorkspace } from '../file-navigator/remote-file-cache.js';
import { Reattach, endRemoteProcess, terminateRemoteEntry, resumeRemote, type RemoteEntry as Entry } from './reattach.js';

// What the tab that owns a channel needs to hear back: its workspace clone is ready (or failed),
// and its channel has gone away.
export type RemoteLaunchHandlers = {
  // `notice` is the remote's own workspace-isolation notice, when it has one to give: isolation is
  // active where the remote is macOS and inactive otherwise, which is the remote's fact to report.
  onReady: (dir: string, notice?: string) => void;
  onFailed: (message: string) => void;
  onClosed: () => void;
};

// The local side runs `ssh -t <destination> '$SHELL -ic "janus remote-serve [<path>]"'`. Nothing is
// shipped over the wire: the remote must already have `janus` on its PATH, and a missing binary
// fails the launch with ssh's own message in the tab's terminal. `-t` forces a real tty so ssh's
// authentication prompts render there.
//
// The `$SHELL -ic` wrapper is what puts `janus` on that PATH. ssh runs a bare command through a
// non-interactive shell, which skips `~/.bashrc` — and that is exactly where nvm and its kind
// install their PATH setup, so a version-managed `janus` would be missing. `$SHELL` expands on the
// remote (sshd sets it from the user's passwd entry) so the wrapper follows whatever shell that
// user configured; the single quotes keep the local `$SHELL -lc` from expanding it first and hold
// the wrapper together as one ssh argument. Both halves of the address are metacharacter-free by
// `parseRemoteAddress`, so nesting them a quoting level deeper stays safe.
export function remoteServeCommand(address: RemoteAddress): string {
  const serve = `janus remote-serve${address.path ? ` ${address.path}` : ''}`;
  return `ssh -t ${address.destination} '$SHELL -ic "${serve}"'`;
}

// One independently launched remote workspace owns one channel. Tabs joined through the metadata
// row and its file navigator are aliases onto that entry, so the channel survives until its last
// label releases it. Separate launches to the same host deliberately remain separate entries.
export class RemoteManager {
  private entries = new Map<string, Entry>();
  private resume = messageBus.on('system', 'resumed', () => {
    const entries = new Set(this.entries.values());
    for (const entry of entries) resumeRemote(entry);
  });

  constructor(private managers: Managers) {}

  // Open a channel for `label` and start provisioning its remote workspace as soon as the handshake
  // lands. The tab is expected to already exist as a placeholder attached to the returned channel's
  // PTY, so ssh's prompts are answerable in it.
  open(label: string, address: RemoteAddress, cwd: string, handlers: RemoteLaunchHandlers): RemoteChannel {
    const transcript = createRemoteTranscriptSource();
    let resolveReady = (_dir: string) => {};
    let rejectReady = (_error: Error) => {};
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
    const ready = new Promise<string>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    void ready.catch(() => {});
    // The channel and its transport reference each other: the channel parses what the ssh PTY
    // produces, and its own frames are written back to that PTY. Held in one box so neither has to
    // exist before the other.
    const deferred: { channel?: RemoteChannel; session?: PtySession } = {};

    const channel = new RemoteChannel(
      {
        get id() { return deferred.session?.id ?? ''; },
        write: (data) => deferred.session?.write(data),
        kill: () => deferred.session?.kill(),
      },
      {
        onTerminalData: (data) => messageBus.emit('pty', { type: 'data', id: deferred.session?.id ?? '', data }),
        onAttached: () => {
          if (entry.reconnect.active && channel.sessionId) {
            channel.send({ type: 'reattach', session: channel.sessionId });
          } else channel.send({ type: 'provision', label, tokens: getProjectTokens(), identity: getGitIdentity() });
        },
        onFrame: (frame) => {
          switch (frame.type) {
          case 'reattach-result': {
            if (frame.accepted) {
              entry.reconnect.accepted();
              if (frame.truncated) this.reportTruncatedReplay(entry);
            } else terminateRemoteEntry(this.managers, entry);
            break;
          }
          case 'workspace-ready': {
            if (!entry.closed) { entry.workspaceDir = frame.dir; entry.settled = true; entry.resolveReady(frame.dir); }
            entry.handlers.get(label)?.onReady(frame.dir, frame.notice);
            break;
          }
          case 'workspace-failed': {
            if (!entry.closed) { entry.settled = true; entry.rejectReady(new Error(frame.message)); }
            entry.handlers.get(label)?.onFailed(frame.message);
            break;
          }
          case 'browser-exited': { this.notifyBrowserGone(frame.id, frame.message); break; }
          default: { transcript.push(frame.blocks); }
          }
        },
        onError: (message) => {
          if (entry.reconnect.active) return;
          if (!entry.closed && !entry.settled) { entry.settled = true; entry.rejectReady(new Error(message)); }
          entry.handlers.get(label)?.onFailed(message);
        },
        onClose: () => this.channelClosed(entry),
        onSessionExit: (_id, owner, harness) => {
          endRemoteProcess(this.managers, entry, owner ?? label, harness);
        },
      },
    );
    deferred.channel = channel;

    const entry: Entry = {
      channel, transcript, address, labels: new Set([label]), handlers: new Map([[label, handlers]]),
      ready, resolveReady, rejectReady, settled: false, closed: false, workspaceLabel: label,
      reconnect: new Reattach(() => connect(), () => channel.close()),
    };
    this.entries.set(label, entry);
    let generation = 0;
    const connect = () => {
      const current = ++generation;
      deferred.session?.kill();
      channel.replaceTransport({
        get id() { return deferred.session?.id ?? ''; },
        write: (data) => deferred.session?.write(data), kill: () => deferred.session?.kill(),
      });
      deferred.session = this.managers.pty.spawnTransport(entry.labels.values().next().value ?? label,
        'ssh', remoteServeCommand(address), cwd, {
          onData: (data) => { if (current === generation) channel.receive(data); },
          onExit: () => { if (current === generation) channel.closed(); },
        });
    };
    connect();
    return channel;
  }

  // Register a second tab or navigator against the source tab's existing workspace and channel.
  attach(label: string, sourceLabel: string, handlers?: RemoteLaunchHandlers): boolean {
    if (this.entries.has(label)) return false;
    const entry = this.entries.get(sourceLabel);
    if (!entry || entry.closed) return false;
    entry.labels.add(label);
    entry.handlers.set(label, handlers ?? this.joinedHandlers(label));
    this.entries.set(label, entry);
    return true;
  }

  get(label: string): RemoteChannel | undefined { return this.entries.get(label)?.channel; }

  // The tab's remote address, for the connections panel's `ssh:<destination>` row.
  addressOf(label: string): RemoteAddress | undefined { return this.entries.get(label)?.address; }

  // The tab's local transcript source: what the remote's own `createTranscriptSource` pushes into.
  transcriptSource(label: string): RemoteTranscriptSource | undefined { return this.entries.get(label)?.transcript; }

  readyOf(label: string): Promise<string> | undefined { return this.entries.get(label)?.ready; }

  workspaceOf(label: string): string | undefined { return this.entries.get(label)?.workspaceDir; }

  workspaceLabelOf(label: string): string | undefined { return this.entries.get(label)?.workspaceLabel; }

  // Explicit connection close kills every user of the shared channel.
  close(label: string): boolean {
    const entry = this.entries.get(label);
    if (!entry) return false;
    terminateRemoteEntry(this.managers, entry);
    entry.channel.close();
    return true;
  }

  // Drop one tab/navigator's reference, closing the transport only when it was the final user.
  release(label: string): boolean {
    const entry = this.entries.get(label);
    if (!entry) return false;
    this.entries.delete(label);
    entry.labels.delete(label);
    entry.handlers.delete(label);
    const survivor = entry.labels.values().next().value;
    if (survivor) this.managers.pty.reassignTransports(label, survivor);
    else {
      entry.reconnect.stop();
      entry.channel.finish();
      this.channelClosed(entry);
      entry.channel.close();
    }
    return true;
  }

  closeAll(): void {
    const entries = new Set(this.entries.values());
    for (const entry of entries) { entry.reconnect.stop(); entry.closed = true; entry.channel.finish(); entry.channel.close(); }
    this.entries.clear();
  }

  closeTab(label: string): void { this.release(label); }

  dispose(): void { this.resume.unsubscribe(); this.closeAll(); }

  private joinedHandlers(label: string): RemoteLaunchHandlers {
    return {
      onReady: () => {},
      onFailed: () => {},
      onClosed: () => {
        const index = this.managers.tab.findIndex(label);
        if (index !== -1) this.managers.tab.closeTab(index);
      },
    };
  }

  // A remote `-b` tab's browser is gone. The tab is resolved from the frame's session id rather than
  // from the channel's label, because joined tabs share a channel and the channel label would name
  // the wrong one. A frame for an already-closed tab is dropped.
  //
  // Delivered onto the tab as well as into the notifications tab, for the same reason the local
  // path does it: the agent whose next `connect()` is about to fail is working in that tab, and a
  // notification is worth nothing to a user who keeps the feed closed.
  private notifyBrowserGone(sessionId: string, message?: string): void {
    const tab = this.managers.tab.harnessTabByPtyId(sessionId);
    if (!tab?.harness) return;
    const text = message ?? 'e2e browser stopped on the remote host';
    notify(this.managers, 'e2e-browser-gone', tab.label, text);
    tab.harness.browserError = text;
    messageBus.emit('state', { type: 'dirty' });
  }

  // The detached peer's replay buffer overflowed and dropped its oldest frames. A harness tab's
  // body is its PTY and nothing renders `tab.log` there, so only a non-harness (agent) tab gets a
  // visible line — the same reasoning `endRemoteSession`'s non-harness branch already uses.
  private reportTruncatedReplay(entry: Entry): void {
    for (const label of entry.labels) {
      const tab = this.managers.tab.byLabel(label);
      if (!tab || tab.harness) continue;
      tab.log = [...tab.log, { input: '', output: 'Some remote output produced while disconnected was dropped to limit memory use.' }];
    }
    messageBus.emit('state', { type: 'dirty' });
  }

  private channelClosed(entry: Entry): void {
    if (entry.closed) return;
    if (entry.channel.sessionId && entry.workspaceDir) { entry.reconnect.lost(); return; }
    entry.closed = true;
    if (!entry.settled) {
      entry.settled = true;
      entry.rejectReady(new Error(`Remote session to ${entry.address.host} ended before its workspace was ready.`));
    } else if (entry.workspaceDir && entry.labels.size > 0) {
      notify(this.managers, 'remote-session-ended', entry.labels.values().next().value!,
        `Remote janus on ${entry.address.host} ended — start a new agent or shell to continue.`);
    }
    clearRemoteFileCacheForWorkspace(entry.address.host, entry.workspaceLabel);
    for (const label of entry.labels) {
      if (this.entries.get(label) === entry) this.entries.delete(label);
    }
    const handlers = [...entry.handlers.values()];
    entry.labels.clear();
    entry.handlers.clear();
    for (const handler of handlers) handler.onClosed();
  }

}
