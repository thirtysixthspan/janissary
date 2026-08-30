import { messageBus } from '../bus.js';
import { getProjectTokens } from '../project-tokens.js';
import type { Managers } from '../managers.js';
import type { PtySession } from '../pty.js';
import type { RemoteAddress } from './address.js';
import { RemoteChannel } from './channel.js';
import { createRemoteTranscriptSource, type RemoteTranscriptSource } from './transcript-source.js';
import { notify } from '../notifications.js';
import { clearRemoteFileCacheForWorkspace } from '../file-navigator/remote-file-cache.js';

// What the tab that owns a channel needs to hear back: its workspace clone is ready (or failed),
// and its channel has gone away.
export type RemoteLaunchHandlers = {
  // `notice` is the remote's own workspace-isolation notice, when it has one to give: isolation is
  // active where the remote is macOS and inactive otherwise, which is the remote's fact to report.
  onReady: (dir: string, notice?: string) => void;
  onFailed: (message: string) => void;
  onClosed: () => void;
};

type Entry = {
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
  workspaceLabel: string;
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
        onAttached: () => deferred.channel?.send({ type: 'provision', label, tokens: getProjectTokens() }),
        onFrame: (frame) => {
          switch (frame.type) {
          case 'workspace-ready': {
            const entry = this.entries.get(label);
            if (entry) { entry.workspaceDir = frame.dir; entry.settled = true; entry.resolveReady(frame.dir); }
            handlers.onReady(frame.dir, frame.notice);
            break;
          }
          case 'workspace-failed': {
            const entry = this.entries.get(label);
            if (entry) { entry.settled = true; entry.rejectReady(new Error(frame.message)); }
            handlers.onFailed(frame.message);
            break;
          }
          default: { transcript.push(frame.blocks); }
          }
        },
        onError: (message) => {
          const entry = this.entries.get(label);
          if (entry && !entry.settled) { entry.settled = true; entry.rejectReady(new Error(message)); }
          handlers.onFailed(message);
        },
        onClose: () => this.channelClosed(label),
      },
    );
    deferred.channel = channel;

    this.entries.set(label, {
      channel, transcript, address, labels: new Set([label]), handlers: new Map([[label, handlers]]),
      ready, resolveReady, rejectReady, settled: false, workspaceLabel: label,
    });
    deferred.session = this.managers.pty.spawnTransport(label, 'ssh', remoteServeCommand(address), cwd, {
      onData: (data) => channel.receive(data),
      onExit: () => channel.closed(),
    });
    return channel;
  }

  // Register a second tab or navigator against the source tab's existing workspace and channel.
  attach(label: string, sourceLabel: string, handlers?: RemoteLaunchHandlers): boolean {
    if (this.entries.has(label)) return false;
    const entry = this.entries.get(sourceLabel);
    if (!entry) return false;
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
      clearRemoteFileCacheForWorkspace(entry.address.host, entry.workspaceLabel);
      entry.channel.close();
    }
    return true;
  }

  closeAll(): void {
    const entries = new Set(this.entries.values());
    for (const entry of entries) entry.channel.close();
    this.entries.clear();
  }

  dispose(): void { this.closeAll(); }

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

  private channelClosed(anyLabel: string): void {
    const entry = this.entries.get(anyLabel);
    if (!entry) return;
    if (!entry.settled) {
      entry.settled = true;
      entry.rejectReady(new Error(`Remote session to ${entry.address.host} ended before its workspace was ready.`));
    } else if (entry.workspaceDir && entry.labels.size > 0) {
      notify(this.managers, 'manual', anyLabel, `Remote connection to ${entry.address.host} ended.`);
    }
    clearRemoteFileCacheForWorkspace(entry.address.host, entry.workspaceLabel);
    for (const label of entry.labels) this.entries.delete(label);
    const handlers = [...entry.handlers.values()];
    entry.labels.clear();
    entry.handlers.clear();
    for (const handler of handlers) handler.onClosed();
  }
}
