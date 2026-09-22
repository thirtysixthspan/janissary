import { messageBus } from '../bus.js';
import { getGitIdentity } from '../git/identity.js';
import type { Managers } from '../managers.js';
import type { PtySession } from '../pty.js';
import { getProjectTokens } from '../project/tokens.js';
import type { RemoteAddress } from './address.js';
import { Attach, terminateRemoteProcess, type RemoteEntry } from './attach.js';
import { RemoteChannel } from './channel.js';
import { notifyBrowserGone, reportTruncatedReplay } from './manager-reports.js';
import type { RemoteLaunchHandlers } from './manager.js';
import { answerSessionState, handleAttachResult, type RemoteResume } from './resume.js';
import { createRemoteTranscriptSource } from './transcript-source.js';

export type RemoteEntryFactoryOptions = {
  managers: Managers;
  label: string;
  address: RemoteAddress;
  cwd: string;
  handlers: RemoteLaunchHandlers;
  resume?: RemoteResume;
  channelClosed: (entry: RemoteEntry) => void;
  sessionsChanged: () => void;
};

// The `janus remote-serve` invocation both `remoteServeCommand` and `remoteCaptureCommand`
// build over ssh, differing only in which non-interactive `-o` flags (if any) precede `-t`.
// Kept as one builder so a fix to the path interpolation or the `$SHELL -ic` quoting cannot land
// in one variant and not the other.
function sshRemoteCommand(address: RemoteAddress, options: string[] = []): string {
  const serve = `janus remote-serve${address.path ? ` ${address.path}` : ''}`;
  const flags = options.length > 0 ? `${options.join(' ')} ` : '';
  return `ssh ${flags}-t ${address.destination} '$SHELL -ic "${serve}"'`;
}

export function remoteServeCommand(address: RemoteAddress): string {
  return sshRemoteCommand(address);
}

export function remoteCaptureCommand(address: RemoteAddress): string {
  return sshRemoteCommand(address, ['-o BatchMode=yes', '-o NumberOfPasswordPrompts=0', '-o ConnectTimeout=10']);
}

export function createRemoteEntry({
  managers, label, address, cwd, handlers, resume, channelClosed, sessionsChanged,
}: RemoteEntryFactoryOptions): RemoteEntry {
  const state = { resuming: resume !== undefined };
  const transcript = createRemoteTranscriptSource();
  let resolveReady = (_dir: string) => {};
  let rejectReady = (_error: Error) => {};
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
  const ready = new Promise<string>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  void ready.catch(() => {});
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
        if ((entry.attach.active || state.resuming) && channel.sessionId) {
          channel.send({ type: 'attach', session: channel.sessionId, ...(state.resuming && { restore: true }) });
        } else channel.send({ type: 'provision', label, tokens: getProjectTokens(), identity: getGitIdentity() });
      },
      onFrame: (frame) => {
        switch (frame.type) {
        case 'attach-result': {
          handleAttachResult(managers, entry, frame, label, resume, state,
            () => reportTruncatedReplay(managers, entry));
          break;
        }
        case 'workspace-ready': {
          if (!entry.closed) { entry.workspaceDir = frame.dir; entry.settled = true; entry.resolveReady(frame.dir); }
          entry.handlers.get(label)?.onReady(frame.dir, frame.notice);
          sessionsChanged();
          break;
        }
        case 'workspace-failed': {
          if (!entry.closed) { entry.settled = true; entry.rejectReady(new Error(frame.message)); }
          entry.handlers.get(label)?.onFailed(frame.message);
          break;
        }
        case 'session-state-result': { answerSessionState(entry, frame.processes); break; }
        case 'browser-exited': { notifyBrowserGone(managers, frame.id, frame.message); break; }
        default: { transcript.push(frame.blocks); }
        }
      },
      onError: (message) => {
        if (entry.attach.active) return;
        if (!entry.closed && !entry.settled) { entry.settled = true; entry.rejectReady(new Error(message)); }
        entry.handlers.get(label)?.onFailed(message);
      },
      onClose: () => channelClosed(entry),
      onProcesses: sessionsChanged,
      onSessionExit: (_id, owner, harness) => {
        terminateRemoteProcess(managers, entry, owner ?? label, harness);
        sessionsChanged();
      },
    },
  );
  deferred.channel = channel;
  if (resume) channel.sessionId = resume.session;

  let generation = 0;
  const connect = () => {
    const current = ++generation;
    deferred.session?.kill();
    channel.replaceTransport({
      get id() { return deferred.session?.id ?? ''; },
      write: (data) => deferred.session?.write(data), kill: () => deferred.session?.kill(),
    });
    deferred.session = managers.pty.spawnTransport(entry.labels.values().next().value ?? label,
      'ssh', remoteServeCommand(address), resume ? process.cwd() : cwd, {
        onData: (data) => { if (current === generation) channel.receive(data); },
        onExit: () => { if (current === generation) channel.closed(); },
      });
  };
  const entry: RemoteEntry = {
    channel, transcript, address, labels: new Set([label]), handlers: new Map([[label, handlers]]),
    ready, resolveReady, rejectReady, settled: false, closed: false, workspaceLabel: label,
    attach: new Attach(connect, () => channel.close()),
  };
  connect();
  return entry;
}
