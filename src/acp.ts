import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
} from '@agentclientprotocol/sdk';
import type { PromptHandlers, AcpSession, AcpOptions } from './types.js';

/**
 * Connect to an arbitrary ACP agent launched as a subprocess and drive it as an ACP
 * client over stdio. This is agent-agnostic — the caller supplies the command to run
 * (e.g. `npx @agentclientprotocol/claude-agent-acp` or `opencode acp`).
 *
 * MVP scope: streams `agent_message_chunk` text into the prompt handler, auto-denies tool
 * permission requests, and advertises no fs/terminal capabilities (so the agent never
 * calls those back).
 */
export function connectAcp(opts: AcpOptions): AcpSession {
  const proc = spawn(opts.command, opts.args, {
    cwd: opts.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  proc.on('error', (e) => opts.onError(`failed to start ACP agent: ${e.message}`));

  // The current in-flight prompt's handlers; session updates are routed here.
  let current: PromptHandlers | null = null;

  const client: Client = {
    async sessionUpdate(params) {
      const update = params.update;
      if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
        current?.onChunk(update.content.text);
      }
    },
    // MVP: auto-deny tool permission (read-only). A real permission UI replaces this.
    async requestPermission() {
      return { outcome: { outcome: 'cancelled' } };
    },
  };

  const input = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>;
  const output = Writable.toWeb(proc.stdin!) as WritableStream<Uint8Array>;
  const conn = new ClientSideConnection(() => client, ndJsonStream(output, input));

  let sessionId: string | null = null;
  let ready: Promise<void> | null = null;
  const ensureSession = (): Promise<void> => {
    if (!ready) {
      ready = (async () => {
        const init = await conn.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
        const res = await conn.newSession({ cwd: opts.cwd, mcpServers: [] });
        sessionId = res.sessionId;
        // Provider from the agent's reported name (fallback: the command basename);
        // model is best-effort from the session's current mode (ACP has no model field).
        const provider = init.agentInfo?.name ?? opts.command.replace(/^.*[\\/]/, '');
        const modes = res.modes;
        const model = modes
          ? modes.availableModes.find((m) => m.id === modes.currentModeId)?.name ?? modes.currentModeId
          : undefined;
        opts.onConnect?.({ provider, model });
      })();
    }
    return ready;
  };

  return {
    prompt: (text, handlers) => {
      current = handlers;
      void (async () => {
        try {
          await ensureSession();
          const res = await conn.prompt({ sessionId: sessionId!, prompt: [{ type: 'text', text }] });
          handlers.onEnd(res.stopReason);
        } catch (e) {
          handlers.onError(e instanceof Error ? e.message : String(e));
        } finally {
          if (current === handlers) current = null;
        }
      })();
    },
    kill: () => {
      try { proc.kill(); } catch { /* already gone */ }
    },
  };
}
