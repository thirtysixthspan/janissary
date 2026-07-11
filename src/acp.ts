import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
} from '@agentclientprotocol/sdk';
import type { PromptHandlers, AcpSession, AcpOptions } from './types.js';
import { sandboxSpawn } from './sandbox.js';
import { getGithubToken } from './github-token.js';
import { decidePermission } from './acp-tools.js';

/**
 * Connect to an arbitrary ACP agent launched as a subprocess and drive it as an ACP
 * client over stdio. This is agent-agnostic — the caller supplies the command to run
 * (e.g. `npx @agentclientprotocol/claude-agent-acp` or `opencode acp`).
 *
 * Scope: streams `agent_message_chunk` text into the prompt handler and advertises no fs/terminal
 * capabilities (so the agent never calls those back). Tool permission requests are denied unless
 * `options.allowedTools` opts a classified web tool in (see acp-tools.ts) — undefined/empty (every
 * non-monitor caller and every tool-less persona) denies every request, as before.
 *
 * `workspaceDir`/`offline` confine the subprocess to that workspace via a Seatbelt sandbox (see
 * sandbox.ts); omitted (monitor sessions never set them), the command runs exactly as before.
 */
export function connectAcp(options: AcpOptions): AcpSession {
  const baseEnv = options.env ? { ...process.env, ...options.env } : process.env;
  const { command, args, env } = sandboxSpawn(
    {
      workspaceDir: options.workspaceDir,
      offline: options.offline,
      githubToken: options.workspaceDir ? getGithubToken() : undefined,
    },
    options.command, options.args, baseEnv,
  );
  const proc = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
  proc.on('error', (error) => options.onError(`failed to start ACP agent: ${error.message}`));

  // The current in-flight prompt's handlers; session updates are routed here.
  let current: PromptHandlers | undefined;

  const client: Client = {
    async sessionUpdate(parameters) {
      const update = parameters.update;
      if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
        current?.onChunk(update.content.text);
      }
    },
    // Deny every tool request unless the persona's allowlist opts a classified web tool in.
    async requestPermission(params) {
      return { outcome: decidePermission(options.allowedTools, params.toolCall, params.options) };
    },
  };

  const input = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
  const output = Writable.toWeb(proc.stdin) as WritableStream<Uint8Array>;
  const conn = new ClientSideConnection(() => client, ndJsonStream(output, input));

  let sessionId: string | undefined;
  let ready: Promise<void> | undefined;
  const ensureSession = (): Promise<void> => {
    ready ??= (async () => {
      const init = await conn.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
      const response = await conn.newSession({ cwd: options.cwd, mcpServers: [] });
      sessionId = response.sessionId;
      // Provider from the agent's reported name (fallback: the command basename);
      // model is best-effort from the session's current mode (ACP has no model field).
      const provider = init.agentInfo?.name ?? options.command.replace(/^.*[\\/]/, '');
      const modes = response.modes;
      const model = modes
        ? modes.availableModes.find((m) => m.id === modes.currentModeId)?.name ?? modes.currentModeId
        : undefined;
      options.onConnect?.({ provider, model });
    })();
    return ready;
  };

  return {
    prompt: (text, handlers) => {
      current = handlers;
      void (async () => {
        try {
          await ensureSession();
          const response = await conn.prompt({ sessionId: sessionId!, prompt: [{ type: 'text', text }] });
          handlers.onEnd(response.stopReason);
        } catch (error) {
          handlers.onError(error instanceof Error ? error.message : String(error));
        } finally {
          if (current === handlers) current = undefined;
        }
      })();
    },
    kill: () => {
      try { proc.kill(); } catch { /* already gone */ }
    },
  };
}
