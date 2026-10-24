import { connectAcp } from '../acp/index.js';
import { acpActivity } from '../acp/activity.js';
import type { AcpSession } from '../acp/types.js';
import type { ProjectTokens } from '../project/tokens.js';
import type { ClientFrame, ServerFrame } from './protocol-frames.js';
import { sandboxWillConfine } from '../sandbox/confinement.js';

const ACP_SHUTDOWN_TIMEOUT_MS = 5000;

type RemoteAcpRecord =
  | { state: 'live'; session: AcpSession; runOnly: boolean }
  | { state: 'closing'; session: AcpSession; pending: Promise<boolean> }
  | { state: 'settled'; released: boolean; session?: AcpSession };

async function stopSession(session: AcpSession): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => { resolve(false); }, ACP_SHUTDOWN_TIMEOUT_MS);
  });
  const stopped = (async () => {
    try {
      await session.shutdown();
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await Promise.race([stopped, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  private records = new Map<string, RemoteAcpRecord>();

  constructor(
    private send: (frame: ServerFrame) => void,
    private workspaceDir: string,
    private tokens: ProjectTokens = {},
  ) {}

  open(frame: Extract<ClientFrame, { type: 'acp-open' }>): void {
    const id = frame.id;
    const existing = this.records.get(id);
    if (existing && (existing.state !== 'settled' || existing.session)) return;
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
        const activity = acpActivity(update);
        if (activity) this.send({ type: 'acp-activity', id, ...activity });
      },
      // The connection-level channel: a failed spawn or a dead agent means the session no longer
      // exists, so it travels as fatal and the local side drops its record of it.
      onError: (message) => { this.send({ type: 'acp-error', id, message, fatal: true }); },
      onConnect: () => { this.send({ type: 'acp-ready', id, sandboxed }); },
    });
    this.records.set(id, { state: 'live', session, runOnly: frame.autonomous === true });
  }

  prompt(frame: Extract<ClientFrame, { type: 'acp-prompt' }>): void {
    const id = frame.id;
    const record = this.records.get(id);
    if (record?.state !== 'live') {
      this.send({ type: 'acp-error', id, message: 'No remote ACP session is open.', fatal: true });
      return;
    }
    record.session.prompt(frame.text, {
      onChunk: (text) => { this.send({ type: 'acp-chunk', id, text }); },
      onEnd: (stopReason) => { this.send({ type: 'acp-end', id, stopReason }); },
      // The prompt failed, not the session. A rate limit clears on its own, and killing the session
      // over one would throw away the whole accumulated conversation.
      onError: (message) => { this.send({ type: 'acp-error', id, message, fatal: false }); },
    });
  }

  async close(id: string): Promise<void> {
    let record = this.records.get(id);
    if (record?.state === 'live') {
      record = this.trackShutdown(id, record.session);
    }
    const released = record?.state === 'closing' ? await record.pending
      : record?.state === 'settled' ? record.released : true;
    if (record?.state === 'closing' && this.records.get(id) === record) {
      this.settle(id, record, released);
    }
    this.send({ type: 'acp-closed', id, released });
  }

  detachRuns(): void {
    for (const [id, record] of this.records) {
      if (record.state !== 'live' || !record.runOnly) continue;
      this.trackShutdown(id, record.session);
    }
  }

  // Every session this server holds, for shutdown. `connectAcp`'s `shutdown()` suppresses its own exit
  // reporting, so neither path produces a spurious fatal error frame for a session that was closed
  // deliberately.
  dispose(): boolean | Promise<boolean> {
    const pending: { id: string; session: AcpSession; result: Promise<boolean>; outcome?: boolean }[] = [];
    for (const [id, record] of this.records) {
      if (record.state === 'closing') {
        pending.push({ id, session: record.session, result: record.pending });
        continue;
      }
      if (record.state === 'settled' && (record.released || !record.session)) continue;
      const session = record.session;
      if (!session) continue;
      pending.push({ id, session, result: stopSession(session), ...(record.state === 'settled' && { outcome: record.released }) });
    }
    this.records.clear();
    if (pending.length === 0) return true;
    return this.disposalResult(pending);
  }

  private async disposalResult(pending: { id: string; session: AcpSession; result: Promise<boolean>; outcome?: boolean }[]): Promise<boolean> {
    const outcomes = await Promise.all(pending.map(async ({ id, session, result, outcome }) => {
      const released = await result;
      const current = this.records.get(id);
      if (!current) {
        this.records.set(id, { state: 'settled', released: outcome ?? released, ...(!released && { session }) });
      }
      return released;
    }));
    return outcomes.every(Boolean);
  }

  private trackShutdown(id: string, session: AcpSession): Extract<RemoteAcpRecord, { state: 'closing' }> {
    const closing = { state: 'closing' as const, session, pending: stopSession(session) };
    this.records.set(id, closing);
    void closing.pending.then((released) => {
      this.settle(id, closing, released);
    });
    return closing;
  }

  private settle(
    id: string,
    closing: Extract<RemoteAcpRecord, { state: 'closing' }>,
    released: boolean,
  ): void {
    if (this.records.get(id) !== closing) return;
    this.records.set(id, { state: 'settled', released, ...(!released && { session: closing.session }) });
  }
}
