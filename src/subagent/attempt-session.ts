import { randomUUID } from 'node:crypto';
import type { AcpSession } from '../acp/types.js';
import { acpActivity, type AcpActivity, type AcpActivityKind } from '../acp/activity.js';
import type { AcpLaunch } from '../acp/launch.js';
import { connectAcp } from '../acp/index.js';
import { createRemoteAcpSession, type RemoteAcpSession } from '../remote/acp-session.js';
import type { RemoteChannel } from '../remote/channel/index.js';
import { deferred } from '../deferred.js';

export type SubagentAttemptRemote = Readonly<{
  channel: RemoteChannel;
  host: string;
  workspace: string;
}>;

export type SubagentAttemptLease = Readonly<{
  session: AcpSession | RemoteAcpSession;
  dispose: () => Promise<void>;
}>;

export type SubagentAttemptSessionOptions = Readonly<{
  launch: AcpLaunch;
  executionDir: string;
  runId: string;
  offline?: boolean;
  remote?: SubagentAttemptRemote;
  onDispose: (dispose: () => Promise<void>) => void;
  onError: (message: string) => void;
  onSessionStarted: (id: string) => void;
  onActivity: (activity: AcpActivity) => void;
  onRemoteActivity: (kind: AcpActivityKind, text: string) => void;
  onTerminated: () => void;
  active: () => boolean;
  adoptSession?: (lease: SubagentAttemptLease) => void;
}>;

export function openSubagentAttemptSession(options: SubagentAttemptSessionOptions): SubagentAttemptLease {
  const observations: (() => void)[] = [];
  let buffering = true;
  let valid = true;
  let handle: AcpSession | RemoteAcpSession | undefined;
  let closed: Promise<void> | undefined;
  const construction = deferred<void>();
  void construction.promise.catch(() => {});

  const emit = (fn: () => void): void => {
    if (buffering) observations.push(fn);
    else if (valid && options.active()) fn();
  };

  const dispose = (): Promise<void> => {
    closed ??= (async () => {
      await construction.promise;
      options.onTerminated();
      valid = false;
      if (handle === undefined) return;
      if ('remote' in handle) {
        if (!await handle.release()) throw new Error('Remote agent close was not acknowledged.');
      } else {
        await handle.shutdown();
      }
    })();
    return closed;
  };
  options.onDispose(dispose);

  const local = {
    onError: (message: string) => emit(() => options.onError(message)),
    onSessionStarted: (id: string) => emit(() => options.onSessionStarted(id)),
    onActivity: (update: unknown) => emit(() => {
      const activity = acpActivity(update);
      if (activity) options.onActivity(activity);
    }),
  };

  function build(): AcpSession | RemoteAcpSession {
    const { launch, executionDir, runId, offline, remote } = options;
    const shared = {
      command: launch.command,
      args: launch.args,
      env: launch.env,
      ...(launch.sessionMeta !== undefined && { sessionMeta: launch.sessionMeta }),
      ...(offline !== undefined && { offline }),
    };
    if (remote) {
      return createRemoteAcpSession(remote.channel, {
        ...shared, id: `subagent-${runId}-${randomUUID()}`, workspace: remote.workspace,
      }, {
        onError: local.onError,
        onConnect: () => {},
        onSessionStarted: local.onSessionStarted,
        onActivity: (kind, text) => emit(() => options.onRemoteActivity(kind, text)),
        onTransportLost: () => emit(() => options.onError('Remote connection lost before agent readiness.')),
      });
    }
    return connectAcp({ ...shared, cwd: executionDir, workspaceDir: executionDir, ...local });
  }

  let buildError: unknown;
  let buildFailed = false;
  try { handle = build(); }
  catch (error) { buildError = error; buildFailed = true; }
  finally { construction.resolve(); }

  let lease: SubagentAttemptLease | undefined;
  if (handle !== undefined) {
    lease = { session: handle, dispose };
    try { options.adoptSession?.(lease); }
    catch (error) { void dispose(); buildError = error; buildFailed = true; }
  }

  buffering = false;
  for (const observation of observations) {
    if (!valid || !options.active()) break;
    observation();
  }
  if (buildFailed) throw buildError;
  return lease!;
}
