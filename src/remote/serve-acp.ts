import { connectAcp } from '../acp/index.js';
import type { AcpSession } from '../acp/types.js';
import type { ProjectTokens } from '../project/tokens.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';
import { sandboxWillConfine } from '../sandbox/confinement.js';

// The remote server's ACP holder: one live agent session per session id, driven by the ACP frames.
// The JSON-RPC never leaves this machine — the local side sends prompts and gets reply text back —
// so nothing `opencode` writes to stderr can land mid-frame in a stream that must be strictly
// newline-delimited JSON.
//
// Keyed by id rather than holding a single session, because one `remote-serve` serves every tab
// sharing its channel: the launching tab and each agent joined from it through ➕ provision no second
// clone and open no second connection, so their `acp` sessions arrive here together. Each tab still
// gets exactly one, which is the limit the local side enforces.
//
// The local side chooses which agent and model run and names them on the open frame; this class runs
// what it is told, in the workspace it was provisioned with, exactly as `RemoteProcesses` does.
export class RemoteAcp {
  private sessions = new Map<string, { session: AcpSession; runOnly: boolean }>();

  constructor(
    private send: (frame: ServerFrame) => void,
    private workspaceDir: string,
    private tokens: ProjectTokens = {},
  ) {}

  open(frame: Extract<ClientFrame, { type: 'acp-open' }>): void {
    const id = frame.id;
    if (this.sessions.has(id)) return;
    const sandboxed = sandboxWillConfine(this.workspaceDir);
    const session = connectAcp({
      command: frame.command,
      args: frame.args,
      // Both, so the subprocess is confined to the clone exactly as this server's other workspaced
      // processes are, and so the agent sees the files the tab is actually working on.
      cwd: this.workspaceDir,
      workspaceDir: this.workspaceDir,
      offline: frame.offline,
      env: frame.env,
      tokens: this.tokens,
      autonomous: frame.autonomous,
      effort: frame.effort,
      onActivity: (update) => {
        if (typeof update !== 'object' || update === null || !('sessionUpdate' in update)) return;
        const value = update as { sessionUpdate?: unknown; content?: unknown };
        const kind = this.activityKind(value.sessionUpdate);
        if (!kind) return;
        const content = value.content;
        const text = typeof content === 'string' ? content
          : typeof content === 'object' && content !== null && 'text' in content && typeof content.text === 'string'
            ? content.text : JSON.stringify(content ?? update);
        this.send({ type: 'acp-activity', id, kind, text });
      },
      // The connection-level channel: a failed spawn or a dead agent means the session no longer
      // exists, so it travels as fatal and the local side drops its record of it.
      onError: (message) => { this.send({ type: 'acp-error', id, message, fatal: true }); },
      onConnect: () => { this.send({ type: 'acp-ready', id, sandboxed }); },
    });
    this.sessions.set(id, { session, runOnly: frame.autonomous === true });
  }

  prompt(frame: Extract<ClientFrame, { type: 'acp-prompt' }>): void {
    const id = frame.id;
    const entry = this.sessions.get(id);
    if (!entry) {
      this.send({ type: 'acp-error', id, message: 'No remote ACP session is open.', fatal: true });
      return;
    }
    entry.session.prompt(frame.text, {
      onChunk: (text) => { this.send({ type: 'acp-chunk', id, text }); },
      onEnd: (stopReason) => { this.send({ type: 'acp-end', id, stopReason }); },
      // The prompt failed, not the session. A rate limit clears on its own, and killing the session
      // over one would throw away the whole accumulated conversation.
      onError: (message) => { this.send({ type: 'acp-error', id, message, fatal: false }); },
    });
  }

  close(id: string): void {
    const entry = this.sessions.get(id);
    let released = true;
    try { entry?.session.kill(); } catch { released = false; }
    this.sessions.delete(id);
    this.send({ type: 'acp-closed', id, released });
  }

  detachRuns(): void {
    for (const [id, entry] of this.sessions) {
      if (!entry.runOnly) continue;
      entry.session.kill();
      this.sessions.delete(id);
    }
  }

  private activityKind(update: unknown): 'message' | 'thought' | 'tool' | 'plan' | 'permission' | undefined {
    if (typeof update !== 'string') return undefined;
    if (update === 'agent_message_chunk') return 'message';
    if (update === 'agent_thought_chunk') return 'thought';
    if (update.includes('tool')) return 'tool';
    if (update.includes('plan')) return 'plan';
    if (update.includes('permission')) return 'permission';
    return undefined;
  }

  // Every session this server holds, for shutdown. `connectAcp`'s `kill()` suppresses its own exit
  // reporting, so neither path produces a spurious fatal error frame for a session that was closed
  // deliberately.
  dispose(): void {
    for (const { session } of this.sessions.values()) session.kill();
    this.sessions.clear();
  }
}
