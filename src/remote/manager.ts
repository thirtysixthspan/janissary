import { messageBus } from '../bus.js';
import { getProjectTokens } from '../project/tokens.js';
import { getGitIdentity } from '../git/identity.js';
import type { Managers } from '../managers.js';
import type { PtySession } from '../pty.js';
import type { RemoteAddress } from './address.js';
import { RemoteChannel } from './channel.js';
import { createRemoteTranscriptSource, type RemoteTranscriptSource } from './transcript-source.js';
import { Reattach, detachRemoteEntry, dropEndedSessionRecord, dropRemoteLabels, emitSessionsChanged, endRemoteProcess, terminateRemoteEntry, resumeRemote, type RemoteEntry as Entry } from './reattach.js';
import { answerSessionState, handleReattachResult, type RemoteResume } from './resume.js';
import { notifyBrowserGone, reportTruncatedReplay } from './manager-reports.js';
import { remoteChannelClosed } from './manager-closed.js';

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
  //
  // With `resume`, the very same routine is a reattach: the channel is created with its session id
  // already set, so the handshake takes the branch that sends `reattach` rather than `provision` and
  // `reattach-result` is handled by the code that already handles it. One connection routine serves
  // launches and reattaches alike.
  open(
    label: string, address: RemoteAddress, cwd: string, handlers: RemoteLaunchHandlers,
    resume?: RemoteResume,
  ): RemoteChannel {
    const state = { resuming: resume !== undefined };
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
          if ((entry.reconnect.active || state.resuming) && channel.sessionId) {
            channel.send({ type: 'reattach', session: channel.sessionId });
          } else channel.send({ type: 'provision', label, tokens: getProjectTokens(), identity: getGitIdentity() });
        },
        onFrame: (frame) => {
          switch (frame.type) {
          case 'reattach-result': {
            handleReattachResult(this.managers, entry, frame, label, resume, state,
              () => reportTruncatedReplay(this.managers, entry));
            break;
          }
          case 'workspace-ready': {
            if (!entry.closed) { entry.workspaceDir = frame.dir; entry.settled = true; entry.resolveReady(frame.dir); }
            entry.handlers.get(label)?.onReady(frame.dir, frame.notice);
            this.sessionsChanged();
            break;
          }
          case 'workspace-failed': {
            if (!entry.closed) { entry.settled = true; entry.rejectReady(new Error(frame.message)); }
            entry.handlers.get(label)?.onFailed(frame.message);
            break;
          }
          case 'session-state-result': { answerSessionState(entry, frame.processes); break; }
          case 'browser-exited': { notifyBrowserGone(this.managers, frame.id, frame.message); break; }
          default: { transcript.push(frame.blocks); }
          }
        },
        onError: (message) => {
          if (entry.reconnect.active) return;
          if (!entry.closed && !entry.settled) { entry.settled = true; entry.rejectReady(new Error(message)); }
          entry.handlers.get(label)?.onFailed(message);
        },
        onClose: () => this.channelClosed(entry),
        // The spawned set is what `recordOf` reads, so a session becomes recordable on the first
        // spawn and stops being on the last exit. Per process, not per byte.
        onProcesses: () => this.sessionsChanged(),
        onSessionExit: (_id, owner, harness) => {
          endRemoteProcess(this.managers, entry, owner ?? label, harness);
          this.sessionsChanged();
        },
      },
    );
    deferred.channel = channel;
    // Set before the first handshake, which is what makes `consumeTerminalPhase` treat the incoming
    // session as one to reattach to rather than one to adopt.
    if (resume) channel.sessionId = resume.session;

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
    this.sessionsChanged();
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
    this.sessionsChanged();
    return true;
  }

  get(label: string): RemoteChannel | undefined { return this.entries.get(label)?.channel; }

  // The tab's remote address, for the connections panel's `ssh:<destination>` row.
  addressOf(label: string): RemoteAddress | undefined { return this.entries.get(label)?.address; }

  // Whether this tab's channel has lost its transport and is retrying. Read when the tab view is
  // built rather than marked onto the tab, so the metadata row's reattach control can never be
  // showing a recovery that has already finished.
  reconnectingOf(label: string): boolean { return this.entries.get(label)?.reconnect.active ?? false; }

  // The tab's local transcript source: what the remote's own `createTranscriptSource` pushes into.
  transcriptSource(label: string): RemoteTranscriptSource | undefined { return this.entries.get(label)?.transcript; }

  readyOf(label: string): Promise<string> | undefined { return this.entries.get(label)?.ready; }

  workspaceOf(label: string): string | undefined { return this.entries.get(label)?.workspaceDir; }

  workspaceLabelOf(label: string): string | undefined { return this.entries.get(label)?.workspaceLabel; }

  // `connection close ssh:<id>` — the user ending the shared session on purpose. The far side is
  // genuinely finished (`terminateRemoteEntry` sends the shutdown frames), recovery stops, and every
  // tab and navigator holding the channel closes, which is the only reason a remote tab's `ssh:` row
  // is separately closable at all. Nothing reaches the notifications feed: `remote-session-ended`
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
      entry.reconnect.stop();
      entry.channel.finish();
      this.channelClosed(entry);
      entry.channel.close();
      dropEndedSessionRecord(this.managers, session);
    }
    this.sessionsChanged();
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
