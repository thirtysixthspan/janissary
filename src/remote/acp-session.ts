import type { AcpLoopHandlers, AcpRunSnapshot, AcpSession, AcpToolHost } from '../acp/types.js';
import { deferred } from '../deferred.js';
import { AcpPromptControl } from '../acp/prompt-control.js';
import type { RemoteChannel } from './channel/index.js';
import type { ClientFrame, RemoteAcpActivityKind } from './protocol-frames.js';
import { errorText } from '../error-text.js';
import { createRemoteAcpRun } from './acp-session-run.js';

// What the local side decides and sends across: which agent runs, with what arguments and
// environment, whether it is confined offline, and the ACP session options that turn a role
// session's built-in tools off. The remote supplies the workspace directory it
// provisioned, so no cwd travels — for a remote tab the local `cwdOf(label)` is a path on the other
// machine and means nothing here.
export type RemoteAcpOptions = {
  id: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  offline?: boolean;
  autonomous?: true;
  effort?: { level: string; model: string };
  sessionMeta?: Record<string, unknown>;
};

// Hooks the owner supplies, matching `AcpManager`'s own `ConnectHooks`: `onError` is the
// connection-level channel, which means "this session is gone", and `onConnect` fires once the
// remote's handshake lands.
export type RemoteAcpHooks = {
  onError: (message: string) => void;
  onConnect: (sandboxed: boolean) => void;
  onActivity?: (kind: RemoteAcpActivityKind, text: string) => void;
  onTransportLost?: () => void;
};

export type RemoteAcpSession = AcpSession & {
  remote: true;
  run: (
    text: string, snapshot: AcpRunSnapshot, runCaller: AcpToolHost['runCaller'], events: AcpLoopHandlers,
  ) => void;
  ready: Promise<boolean>;
  release: () => Promise<boolean>;
};

/**
 * An ACP session running on another machine, surfaced locally as an object satisfying `AcpSession`
 * (`src/acp/types.ts`) — the same adapter trick `createRemoteShell` uses for a remote tab's shell.
 * The ACP client itself lives on the far side, so what crosses the wire is prompt text and reply
 * chunks, never JSON-RPC. Everything built on the session — `runAcpToolLoop`, the transcript
 * entries, the busy dot, the connections panel — therefore works without knowing where the agent runs.
 *
 * It holds no reference to `Managers`, the tab, or the transcript: it turns frames into callbacks
 * and nothing else.
 */
export function createRemoteAcpSession(
  channel: RemoteChannel,
  options: RemoteAcpOptions,
  hooks: RemoteAcpHooks,
): RemoteAcpSession {
  const { id, command, args, env, offline, autonomous, effort, sessionMeta } = options;
  // The one in-flight prompt, matching the discipline `connectAcp` keeps with its own `current`.
  const control = new AcpPromptControl();
  const run = createRemoteAcpRun(control);
  let live = true;
  const { promise: ready, resolve: resolveReady, reject: rejectReady } = deferred<boolean>();
  void ready.catch(() => {});
  let resolveRelease: (released: boolean) => void = () => {};
  let releasePromise: Promise<boolean> | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let failure: string | undefined;

  const detach = (message: string, report: () => void) => {
    const wasLive = live;
    live = false;
    failure = message;
    rejectReady(new Error(message));
    if (releaseTimer) clearTimeout(releaseTimer);
    resolveRelease(false);
    channel.detachAcp(id);
    if (wasLive) report();
    control.release(message);
  };
  const send = (frame: ClientFrame) => {
    try { channel.send(frame); }
    catch (error) {
      const message = frame.type === 'acp-cancel' ? `ACP: cancellation failed: ${errorText(error)}` : errorText(error);
      detach(message, () => hooks.onError(message));
    }
  };

  channel.attachAcp(id, {
    onReady: (sandboxed) => {
      if (!live) return;
      resolveReady(sandboxed);
      hooks.onConnect(sandboxed);
    },
    onChunk: (text) => control.current?.handlers.onChunk(text),
    onActivity: (kind, text) => { if (live && control.current) hooks.onActivity?.(kind, text); },
    onClosed: (released) => {
      if (releaseTimer) clearTimeout(releaseTimer);
      channel.detachAcp(id);
      live = false;
      rejectReady(new Error('ACP session closed.'));
      control.release();
      resolveRelease(released);
    },
    onTransportLost: () => {
      detach('Remote connection lost before agent readiness.', () => hooks.onTransportLost?.());
    },
    onTurn: (frame) => run.turn(frame),
    onRunEnd: (reason) => run.end(reason),
    onEnd: (stopReason) => {
      const turn = control.current;
      if (turn) control.end(turn, stopReason);
    },
    // A prompt that merely failed goes to the running loop, which reports it and leaves the session
    // alone. A fatal one also goes to the connection hook, which is what drops the session — and to
    // the in-flight prompt as well, so the loop terminates rather than waiting on a reply that is
    // never coming.
    onError: (message, fatal) => {
      if (fatal) {
        const wasLive = live;
        detach(message, () => hooks.onError(message));
        if (wasLive) send({ type: 'acp-close', id });
      } else {
        const turn = control.current;
        if (turn) control.error(turn, message);
      }
    },
  });
  send({
    type: 'acp-open', id, command, args,
    ...(env !== undefined && { env }), ...(offline !== undefined && { offline }),
    ...(autonomous !== undefined && { autonomous }), ...(effort !== undefined && { effort }),
    ...(sessionMeta !== undefined && { sessionMeta }),
  });

  const release = (): Promise<boolean> => {
    if (releasePromise) return releasePromise;
    if (!live) return Promise.resolve(false);
    live = false;
    rejectReady(new Error('ACP session closed.'));
    control.release();
    const releasing = deferred<boolean>();
    resolveRelease = releasing.resolve;
    const pending = releasing.promise;
    releasePromise = pending;
    releaseTimer = setTimeout(() => {
      channel.detachAcp(id);
      resolveRelease(false);
    }, 5000);
    send({ type: 'acp-close', id });
    return pending;
  };

  return {
    remote: true,
    ready,
    release,
    shutdown: async () => {
      if (!await release()) throw new Error('Remote agent close was not acknowledged.');
    },
    run: (text, snapshot, runCaller, events) => {
      if (!run.start(runCaller, events)) return;
      send({ type: 'acp-run', id, text, snapshot });
    },
    prompt: (text, handlers) => {
      if (!control.admit(handlers)) return;
      send({ type: 'acp-prompt', id, text });
    },
    cancel: () => {
      if (!live) return Promise.resolve();
      if (!control.current) {
        return (async () => {
          send({ type: 'acp-cancel', id });
          if (!live) throw new Error(failure ?? 'Remote connection unavailable.');
        })();
      }
      return control.cancel(async () => {
        send({ type: 'acp-cancel', id });
        if (!live) throw new Error(failure ?? 'Remote connection unavailable.');
      });
    },
    kill: () => { void release(); },
  };
}
