import { connectAcp } from '../acp/index.js';
import type { AcpSession } from '../acp/types.js';
import type { ProjectTokens } from '../project-tokens.js';
import type { ClientFrame, ServerFrame } from './protocol.js';

// The remote server's ACP holder: at most one live agent session, driven by the ACP frames. The
// JSON-RPC never leaves this machine — the local side sends prompts and gets reply text back — so
// nothing `opencode` writes to stderr can land mid-frame in a stream that must be strictly
// newline-delimited JSON.
//
// The local side chooses which agent and model run and names them on the open frame; this class runs
// what it is told, in the workspace it was provisioned with, exactly as `RemoteProcesses` does.
export class RemoteAcp {
  private id: string | undefined;
  private session: AcpSession | undefined;

  constructor(
    private send: (frame: ServerFrame) => void,
    private workspaceDir: string,
    private tokens: ProjectTokens = {},
  ) {}

  open(frame: Extract<ClientFrame, { type: 'acp-open' }>): void {
    if (this.id !== undefined) return;
    const id = frame.id;
    this.id = id;
    this.session = connectAcp({
      command: frame.command,
      args: frame.args,
      // Both, so the subprocess is confined to the clone exactly as this server's other workspaced
      // processes are, and so the agent sees the files the tab is actually working on.
      cwd: this.workspaceDir,
      workspaceDir: this.workspaceDir,
      offline: frame.offline,
      env: frame.env,
      tokens: this.tokens,
      // The connection-level channel: a failed spawn or a dead agent means the session no longer
      // exists, so it travels as fatal and the local side drops its record of it.
      onError: (message) => { this.send({ type: 'acp-error', id, message, fatal: true }); },
      onConnect: () => { this.send({ type: 'acp-ready', id }); },
    });
  }

  prompt(frame: Extract<ClientFrame, { type: 'acp-prompt' }>): void {
    const id = frame.id;
    if (!this.session || this.id !== id) {
      this.send({ type: 'acp-error', id, message: 'No remote ACP session is open.', fatal: true });
      return;
    }
    this.session.prompt(frame.text, {
      onChunk: (text) => { this.send({ type: 'acp-chunk', id, text }); },
      onEnd: (stopReason) => { this.send({ type: 'acp-end', id, stopReason }); },
      // The prompt failed, not the session. A rate limit clears on its own, and killing the session
      // over one would throw away the whole accumulated conversation.
      onError: (message) => { this.send({ type: 'acp-error', id, message, fatal: false }); },
    });
  }

  close(id: string): void {
    if (this.id !== id) return;
    this.dispose();
  }

  // `connectAcp`'s `kill()` suppresses its own exit reporting, so neither path produces a spurious
  // fatal error frame for a session that was closed deliberately.
  dispose(): void {
    this.session?.kill();
    this.session = undefined;
    this.id = undefined;
  }
}
