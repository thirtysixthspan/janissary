import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import type { RemoteAddress } from './address.js';
import type { RemoteChannel } from './channel.js';
import type { ServerFrame } from './protocol.js';
import type { RemoteTranscriptSource } from './transcript-source.js';
import { detachRemoteEntry, dropTerminatedSessionRecord, dropRemoteLabels, emitSessionsChanged, terminateRemoteEntry, resumeRemote, type RemoteEntry as Entry } from './attach.js';
import type { RemoteResume } from './resume.js';
import { remoteChannelClosed } from './manager-closed.js';
import { createRemoteEntry } from './entry-factory.js';

export { remoteServeCommand } from './entry-factory.js';

// What the tab that owns a channel needs to hear back: its workspace clone is ready (or failed),
// and its channel has gone away.
export type RemoteLaunchHandlers = {
  // `notice` is the remote's own workspace-isolation notice, when it has one to give: isolation is
  // active where the remote is macOS and inactive otherwise, which is the remote's fact to report.
  // `cleaned` is the path of a leftover workspace the remote removed before cloning this one.
  onReady: (dir: string, notice?: string, cleaned?: string) => void;
  onFailed: (message: string) => void;
  onClosed: () => void;
  // The remote refused the launch's label (`name-in-use`). Optional because only a provisioning
  // launch can hear it: an attach or a terminate never provisions.
  onNameRefused?: (frame: Extract<ServerFrame, { type: 'name-in-use' }>) => void;
};


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

  // Create a channel for `label` and start provisioning its remote workspace as soon as the handshake
  // lands. The tab is expected to already exist as a placeholder attached to the returned channel's
  // PTY, so ssh's prompts are answerable in it.
  //
  // With `resume`, the very same routine is an attach: the channel is created with its session id
  // already set, so the handshake takes the branch that sends `attach` rather than `provision` and
  // `attach-result` is handled by the code that already handles it. One connection routine serves
  // launches and attaches alike.
  create(
    label: string, address: RemoteAddress, cwd: string, handlers: RemoteLaunchHandlers,
    resume?: RemoteResume,
  ): RemoteChannel {
    const entry = createRemoteEntry({
      managers: this.managers, label, address, cwd, handlers, resume,
      channelClosed: (closed) => this.channelClosed(closed),
      sessionsChanged: () => this.sessionsChanged(),
    });
    this.entries.set(label, entry);
    this.sessionsChanged();
    return entry.channel;
  }

  // Register a second tab or navigator against the source tab's existing workspace and channel.
  attach(label: string, sourceLabel: string, handlers?: RemoteLaunchHandlers): boolean {
    if (this.entries.has(label)) return false;
    const entry = this.entries.get(sourceLabel);
    if (!entry || entry.closed) return false;
    entry.labels.add(label);
    entry.handlers.set(label, handlers ?? this.joinedHandlers(label));
    this.entries.set(label, entry);
    this.sessionsChanged();
    return true;
  }

  get(label: string): RemoteChannel | undefined { return this.entries.get(label)?.channel; }

  // The tab's remote address, for the connections panel's `ssh:<destination>` row.
  addressOf(label: string): RemoteAddress | undefined { return this.entries.get(label)?.address; }

  // Whether this tab's channel has lost its transport and is retrying. Read when the tab view is
  // built rather than marked onto the tab, so the metadata row's attach control can never be
  // showing a recovery that has already finished.
  reconnectingOf(label: string): boolean { return this.entries.get(label)?.attach.active ?? false; }

  // The tab's local transcript source: what the remote's own `createTranscriptSource` pushes into.
  transcriptSource(label: string): RemoteTranscriptSource | undefined { return this.entries.get(label)?.transcript; }

  readyOf(label: string): Promise<string> | undefined { return this.entries.get(label)?.ready; }

  workspaceOf(label: string): string | undefined { return this.entries.get(label)?.workspaceDir; }

  workspaceLabelOf(label: string): string | undefined { return this.entries.get(label)?.workspaceLabel; }

  // `connection close ssh:<id>` — the user ending the shared session on purpose. The far side is
  // genuinely finished (`terminateRemoteEntry` sends the shutdown frames), recovery stops, and every
  // tab and navigator holding the channel closes, which is the only reason a remote tab's `ssh:` row
  // is separately closable at all. Nothing reaches the notifications feed: `remote-session-terminated`
  // exists to report a session the user did not end, and this is the opposite case.
  close(label: string): boolean {
    const entry = this.entries.get(label);
    if (!entry) return false;
    const handlers = terminateRemoteEntry(this.managers, entry, false);
    dropRemoteLabels(this.entries, entry);
    for (const handler of handlers) handler.onClosed();
    this.sessionsChanged();
    return true;
  }

  // Park this label's session on its host and give up the local hold (see `detachRemoteEntry`). The
  // entry leaves the table before the caller closes the tabs, so the tab-close walk's own `release`
  // finds nothing and cannot send the shutdown frames a detach exists to withhold.
  detach(label: string): boolean {
    const entry = this.entries.get(label);
    if (!entry || !detachRemoteEntry(entry)) return false;
    dropRemoteLabels(this.entries, entry);
    this.sessionsChanged();
    return true;
  }

  // Every live channel, once each — the table is keyed by label and a shared channel appears under
  // every one of them. What the sessions list is composed from (see `src/sessions/snapshot.ts`).
  liveEntries(): Entry[] { return [...new Set(this.entries.values())]; }

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
      // Captured before `finish()` — fifteen lines below, the channel forgets its own session id as
      // part of closing.
      const session = entry.channel.sessionId;
      entry.attach.stop();
      entry.channel.finish();
      this.channelClosed(entry);
      entry.channel.closeAfterShutdown();
      dropTerminatedSessionRecord(this.managers, session);
    }
    this.sessionsChanged();
    return true;
  }

  closeAll(): void {
    const entries = new Set(this.entries.values());
    for (const entry of entries) { entry.attach.stop(); entry.closed = true; entry.channel.finish(); entry.channel.closeAfterShutdown(); }
    this.entries.clear();
  }

  closeTab(label: string): void { this.release(label); }

  dispose(): void { this.resume.unsubscribe(); this.closeAll(); }

  private joinedHandlers(label: string): RemoteLaunchHandlers {
    return {
      onReady: () => {},
      onFailed: () => {},
      onNameRefused: () => {},
      onClosed: () => {
        const index = this.managers.tab.findIndex(label);
        if (index !== -1) this.managers.tab.closeTab(index);
      },
    };
  }

  private channelClosed(entry: Entry): void {
    remoteChannelClosed(this.managers, this.entries, entry);
    this.sessionsChanged();
  }

  // The live set moved: a channel opened, joined, spawned, released, parked, or lost its transport.
  // Emitted from the lifecycle rather than from a read, so `SessionsManager` records a session the
  // moment it becomes recordable instead of the next time someone composes the list, and an open
  // list notices the change instead of waiting for Refresh.
  private sessionsChanged(): void { emitSessionsChanged(); }
}
