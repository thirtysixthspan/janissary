import type { AcpSession, PromptHandlers } from '../acp/types.js';
import type { RemoteChannel } from './channel.js';

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
};

// Hooks the owner supplies, matching `AcpManager`'s own `ConnectHooks`: `onError` is the
// connection-level channel, which means "this session is gone", and `onConnect` fires once the
// remote's handshake lands.
export type RemoteAcpHooks = {
  onError: (message: string) => void;
  onConnect: () => void;
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
): AcpSession {
  const { id, command, args, env, offline } = options;
  // The one in-flight prompt, matching the discipline `connectAcp` keeps with its own `current`.
  let current: PromptHandlers | undefined;
  let live = true;

  channel.attachAcp(id, {
    onReady: () => hooks.onConnect(),
    onChunk: (text) => current?.onChunk(text),
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
      handlers?.onError(message);
      if (fatal) hooks.onError(message);
    },
  });
  channel.send({ type: 'acp-open', id, command, args, env, offline });

  return {
    prompt: (text, handlers) => {
      current = handlers;
      channel.send({ type: 'acp-prompt', id, text });
    },
    kill: () => {
      if (!live) return;
      live = false;
      current = undefined;
      channel.send({ type: 'acp-close', id });
      channel.detachAcp(id);
    },
  };
}
