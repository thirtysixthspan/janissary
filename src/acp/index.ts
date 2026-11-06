import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type RequestPermissionOutcome,
  type RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type { AcpSession, AcpOptions } from './types.js';
import { AcpPromptControl } from './prompt-control.js';
import { sandboxSpawn } from '../sandbox/index.js';
import { agentCredentialEnv } from '../sandbox/environment.js';
import { getProjectTokens } from '../project/tokens.js';
import { decidePermission } from './tools.js';
import { errorText } from '../error-text.js';
import { childOutputTail, withChildOutput } from '../child-output.js';
import { selectAcpEffort } from './effort.js';
import { shutdownProcessTree } from './process-tree.js';
import { locateAcpCommand } from './command-path.js';
import { acpCredentials } from './credentials.js';

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
 * src/sandbox/index.ts); omitted (monitor sessions never set them), the command runs unconfined but
 * still gets the token files' harness credentials (see `agentCredentialEnv`), since an agent such as
 * opencode may have no other way to authenticate.
 */
export function connectAcp(options: AcpOptions): AcpSession {
  const tokens = options.tokens ?? getProjectTokens();
  const credentials = acpCredentials(options.workspaceDir);
  const requested = { ...(!options.workspaceDir && agentCredentialEnv(tokens)), ...credentials.env, ...options.env };
  const located = locateAcpCommand(options.command, { ...process.env, ...requested });
  const { command, args, env } = sandboxSpawn(
    {
      workspaceDir: options.workspaceDir,
      installedSkillDirs: options.installedSkillDirs,
      offline: options.offline,
      tokens: options.workspaceDir ? tokens : undefined,
    },
    located.command, options.args, located.env,
  );
  const proc = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    detached: process.platform !== 'win32',
  });
  const exited = new Promise<void>((resolve) => {
    proc.once('exit', resolve);
    proc.once('error', resolve);
  });
  proc.once('exit', credentials.dispose);
  proc.once('error', credentials.dispose);
  let spawnError: Error | undefined;
  const control = new AcpPromptControl();
  // Set by `kill()` before the subprocess is signalled, so a deliberate close reports nothing.
  let killed = false;
  // The agent's stdout is the ACP transport, so stderr is where it says anything a human needs —
  // a failed authentication, a version it will not speak, what to run to restart the session. Nobody
  // read it before, so all of that was discarded and the tab was told only that the agent had gone.
  const stderr = childOutputTail();
  stderr.watch(proc.stderr);
  proc.on('error', (error) => {
    spawnError = error;
    options.onError(withChildOutput(`failed to start ACP agent: ${error.message}`, stderr.text()));
    control.release(error.message);
  });
  // Without this, an agent that dies after a successful spawn leaves a session whose next prompt
  // writes into a closed stdin and never returns. The connection-level channel already means "this
  // session is gone", so the caller can drop it and start a fresh one.
  proc.on('exit', () => {
    if (!killed) options.onError(withChildOutput('ACP agent exited.', stderr.text()));
    control.release('ACP agent exited.');
  });

  const client: Client = {
    async sessionUpdate(parameters) {
      if (killed || !control.current) return;
      const update = parameters.update;
      options.onActivity?.(update);
      if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
        control.current?.handlers.onChunk(update.content.text);
      }
    },
    // Deny every tool request unless the persona's allowlist opts a classified web tool in.
    async requestPermission(params): Promise<RequestPermissionResponse> {
      if (killed || !control.current || control.current.cancelled) return { outcome: { outcome: 'cancelled' } };
      if (options.autonomous === true) {
        const approval = params.options.find((option) => option.kind === 'allow_once')
          ?? params.options.find((option) => option.kind === 'allow_always');
        const outcome: RequestPermissionOutcome = approval
          ? { outcome: 'selected', optionId: approval.optionId }
          : { outcome: 'cancelled' };
        options.onActivity?.({ sessionUpdate: 'permission_decision', toolCall: params.toolCall, outcome });
        return { outcome };
      }
      return { outcome: decidePermission(options.allowedTools, params.toolCall, params.options) };
    },
  };

  const input = Readable.toWeb(proc.stdout) as ReadableStream<Uint8Array>;
  const output = Writable.toWeb(proc.stdin) as WritableStream<Uint8Array>;
  const conn = new ClientSideConnection(() => client, ndJsonStream(output, input));

  let sessionId: string | undefined;
  let ready: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  const ensureSession = (): Promise<void> => {
    ready ??= (async () => {
      const init = await conn.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} });
      if (killed) throw new Error('ACP session closed.');
      const response = await conn.newSession({ cwd: options.cwd, mcpServers: [] });
      if (killed) throw new Error('ACP session closed.');
      sessionId = response.sessionId;
      if (options.effort) {
        const selection = selectAcpEffort(response.configOptions, options.effort.level, options.effort.model);
        if ('error' in selection) throw new Error(selection.error);
        await conn.setSessionConfigOption({ sessionId, configId: selection.configId, value: selection.value });
        if (killed) throw new Error('ACP session closed.');
      }
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

  if (options.autonomous) void (async () => {
    try { await ensureSession(); }
    catch (error) { if (!killed) options.onError(errorText(error)); }
  })();

  return {
    prompt: (text, handlers) => {
      const turn = control.admit(handlers);
      if (!turn) return;
      void (async () => {
        try {
          await ensureSession();
          if (!control.owns(turn)) return;
          if (turn.cancelled) { control.end(turn, 'cancelled'); return; }
          turn.sent = true;
          const response = await conn.prompt({ sessionId: sessionId!, prompt: [{ type: 'text', text }] });
          control.end(turn, response.stopReason);
        } catch (error) {
          control.error(turn, errorText(error));
        }
      })();
    },
    cancel: () => control.cancel(async (turn) => {
      if (turn.sent && sessionId) await conn.cancel({ sessionId });
    }),
    kill: () => {
      killed = true;
      control.release();
      try { proc.kill(); } catch { /* already gone */ }
    },
    shutdown: () => {
      shutdownPromise ??= (async () => {
        killed = true;
        control.release();
        if (spawnError) throw spawnError;
        await shutdownProcessTree(proc, exited);
      })();
      return shutdownPromise;
    },
  };
}
