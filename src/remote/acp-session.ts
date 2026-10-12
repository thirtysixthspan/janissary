import type { AcpSession, PromptHandlers } from '../acp/types.js';
import type { RemoteChannel } from './channel/index.js';

// What the local side decides and sends across: which agent runs, with what arguments and
// environment, and whether it is confined offline. The remote supplies the workspace directory it
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
};

// Hooks the owner supplies, matching `AcpManager`'s own `ConnectHooks`: `onError` is the
// connection-level channel, which means "this session is gone", and `onConnect` fires once the
// remote's handshake lands.
export type RemoteAcpHooks = {
  onError: (message: string) => void;
  onConnect: (sandboxed: boolean) => void;
  onActivity?: (kind: 'message' | 'thought' | 'tool' | 'plan' | 'permission', text: string) => void;
  onTransportLost?: () => void;
};

export type RemoteAcpSession = AcpSession & {
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
  const { id, command, args, env, offline, autonomous, effort } = options;
  // The one in-flight prompt, matching the discipline `connectAcp` keeps with its own `current`.
  let current: PromptHandlers | undefined;
  let live = true;
  let resolveReady = (_sandboxed: boolean) => {};
  let rejectReady = (_error: Error) => {};
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
  const readiness = new Promise<boolean>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const ready = readiness;
  void ready.catch(() => {});
  let resolveRelease: (released: boolean) => void = () => {};
  let releasePromise: Promise<boolean> | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  channel.attachAcp(id, {
    onReady: (sandboxed) => { resolveReady(sandboxed); hooks.onConnect(sandboxed); },
    onChunk: (text) => current?.onChunk(text),
    onActivity: (kind, text) => hooks.onActivity?.(kind, text),
    onClosed: (released) => {
      if (releaseTimer) clearTimeout(releaseTimer);
      channel.detachAcp(id);
      resolveRelease(released);
    },
    onTransportLost: () => {
      rejectReady(new Error('Remote connection lost before agent readiness.'));
      if (releaseTimer) clearTimeout(releaseTimer);
      if (releasePromise) resolveRelease(false);
      channel.detachAcp(id);
      hooks.onTransportLost?.();
    },
    onEnd: (stopReason) => {
      const handlers = current;
      current = undefined;
      handlers?.onEnd(stopReason);
    },
    // A prompt that merely failed goes to the running loop, which reports it and leaves the session
    // alone. A fatal one also goes to the connection hook, which is what drops the session — and to
    // the in-flight prompt as well, so the loop terminates rather than waiting on a reply that is
    // never coming.
    onError: (message, fatal) => {
      const handlers = current;
      if (fatal) current = undefined;
      if (fatal) rejectReady(new Error(message));
      handlers?.onError(message);
      if (fatal) hooks.onError(message);
    },
  });
  channel.send({
    type: 'acp-open', id, command, args,
    ...(env !== undefined && { env }), ...(offline !== undefined && { offline }),
    ...(autonomous !== undefined && { autonomous }), ...(effort !== undefined && { effort }),
  });

  const release = (): Promise<boolean> => {
    if (releasePromise) return releasePromise;
    if (!live) return Promise.resolve(false);
    live = false;
    current = undefined;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the project targets ES2023
    const pending = new Promise<boolean>((resolve) => { resolveRelease = resolve; });
    releasePromise = pending;
    releaseTimer = setTimeout(() => {
      channel.detachAcp(id);
      resolveRelease(false);
    }, 5000);
    channel.send({ type: 'acp-close', id });
    return pending;
  };

  return {
    ready,
    release,
    shutdown: async () => {
      if (!await release()) throw new Error('Remote agent close was not acknowledged.');
    },
    prompt: (text, handlers) => {
      current = handlers;
      channel.send({ type: 'acp-prompt', id, text });
    },
    kill: () => { void release(); },
  };
}
