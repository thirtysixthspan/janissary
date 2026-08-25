import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { PtySession } from '../pty.js';
import type { RemoteAddress } from './address.js';
import { RemoteChannel } from './channel.js';
import { createRemoteTranscriptSource, type RemoteTranscriptSource } from './transcript-source.js';

// What the tab that owns a channel needs to hear back: its workspace clone is ready (or failed),
// and its channel has gone away.
export type RemoteLaunchHandlers = {
  // `notice` is the remote's own workspace-isolation notice, when it has one to give: isolation is
  // active where the remote is macOS and inactive otherwise, which is the remote's fact to report.
  onReady: (dir: string, notice?: string) => void;
  onFailed: (message: string) => void;
  onClosed: () => void;
};

type Entry = { channel: RemoteChannel; transcript: RemoteTranscriptSource; address: RemoteAddress };

// The local side runs `ssh -t <destination> janus remote-serve [<path>]`. Nothing is shipped over
// the wire: the remote must already have `janus` on its PATH, and a missing binary fails the launch
// with ssh's own message in the tab's terminal. `-t` forces a real tty so ssh's authentication
// prompts render there.
export function remoteServeCommand(address: RemoteAddress): string {
  return `ssh -t ${address.destination} janus remote-serve${address.path ? ` ${address.path}` : ''}`;
}

// One ssh session and one `remote-serve` process per remote tab — no multiplexing, no shared
// channel. The cost is one authentication per launch; the benefit is that a tab's lifetime and its
// channel's lifetime are the same thing, so close, kill, drop, and cleanup all collapse into one
// path. This registry is only the lookup: given a tab label, which channel does it own.
export class RemoteManager {
  private entries = new Map<string, Entry>();

  constructor(private managers: Managers) {}

  // Open a channel for `label` and start provisioning its remote workspace as soon as the handshake
  // lands. The tab is expected to already exist as a placeholder attached to the returned channel's
  // PTY, so ssh's prompts are answerable in it.
  open(label: string, address: RemoteAddress, cwd: string, handlers: RemoteLaunchHandlers): RemoteChannel {
    const transcript = createRemoteTranscriptSource();
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
        onAttached: () => deferred.channel?.send({ type: 'provision', label }),
        onFrame: (frame) => {
          switch (frame.type) {
          case 'workspace-ready': { handlers.onReady(frame.dir, frame.notice); break; }
          case 'workspace-failed': { handlers.onFailed(frame.message); break; }
          default: { transcript.push(frame.blocks); }
          }
        },
        onError: (message) => handlers.onFailed(message),
        onClose: () => { this.entries.delete(label); handlers.onClosed(); },
      },
    );
    deferred.channel = channel;

    deferred.session = this.managers.pty.spawnTransport(label, 'ssh', remoteServeCommand(address), cwd, {
      onData: (data) => channel.receive(data),
      onExit: () => channel.closed(),
    });
    this.entries.set(label, { channel, transcript, address });
    return channel;
  }

  get(label: string): RemoteChannel | undefined { return this.entries.get(label)?.channel; }

  // The tab's remote address, for the connections panel's `ssh:<destination>` row.
  addressOf(label: string): RemoteAddress | undefined { return this.entries.get(label)?.address; }

  // The tab's local transcript source: what the remote's own `createTranscriptSource` pushes into.
  transcriptSource(label: string): RemoteTranscriptSource | undefined { return this.entries.get(label)?.transcript; }

  // Kill a tab's channel. Returns whether one was open (drives `connection close ssh:<id>`).
  close(label: string): boolean {
    const entry = this.entries.get(label);
    if (!entry) return false;
    this.entries.delete(label);
    entry.channel.close();
    return true;
  }

  closeAll(): void {
    for (const [, entry] of this.entries) entry.channel.close();
    this.entries.clear();
  }

  dispose(): void { this.closeAll(); }
}
