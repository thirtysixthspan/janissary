import type { AcpSession, AcpInfo } from './types.js';
import { connectAcp } from './index.js';
import { createRemoteAcpSession } from '../remote/acp-session.js';
import { runAcpToolLoop } from './loop.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications.js';
import { isRateLimitError } from './rate-limit.js';
import { makeUpdateRunning } from './runner.js';
import type { Managers } from '../managers.js';
import { createAcpToolTable, toolPrimer, toolRunner, toolExtractor } from './tool-table.js';

// The ACP agent the manager connects to and the model it runs. Hardcoded for now (the only provider
// wired up); the model string drives the `provider/model` label shown in the connections panel.
const ACP_COMMAND = 'opencode';
const ACP_ARGS = ['acp'];
const ACP_MODEL = 'google/gemini-3.1-flash-lite';

// Refused rather than queued: `RemoteChannel.send` silently drops every frame until ssh has
// authenticated and the handshake has landed, so a prompt typed into a provisioning tab would hang
// forever with the busy dot lit. `send` and `schedule` queue because something else delivers them to
// a tab; `acp` is typed by a person, who can retype it.
const STILL_CONNECTING = 'ACP: the remote session is still connecting.';

// Appended after the tool table's own primer fragments: it describes how the tab renders a reply,
// which is the manager's concern rather than any one tool's.
const MARKDOWN_INSTRUCTION = 'Write your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks, etc.); the tab renders them as formatted Markdown.';

// Which agent and model run — decided here on both paths, and sent across for a remote tab, so one
// definition holds and the two installations cannot silently disagree about the model.
function acpLaunch(): { command: string; args: string[]; env: Record<string, string> } {
  return {
    command: ACP_COMMAND,
    args: ACP_ARGS,
    env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: ACP_MODEL }) },
  };
}

// Split a `provider/model` config string into its parts; a bare `model` with no slash has no
// provider. Drives the connections-panel label.
function parseModel(model: string): AcpInfo {
  const slash = model.indexOf('/');
  return slash === -1 ? { model } : { provider: model.slice(0, slash), model: model.slice(slash + 1) };
}

// Hooks the caller supplies when connecting: `onError` surfaces connection-level errors into the tab
// transcript, `onConnect` re-renders once the handshake completes (the manager records the session's
// model info just before calling it, so the connection label resolves).
type ConnectHooks = {
  onError: (message: string) => void;
  onConnect: () => void;
};

// Owns the per-tab ACP sessions (keyed by tab label) and their reported model info. Sessions connect
// lazily on first use and persist across prompts; the manager spawns/reuses them, exposes the
// connection label, and tears them down. The prompt/tool-loop orchestration stays with the caller —
// the manager only hands back the live session.
export class AcpManager {
  private sessions = new Map<string, AcpSession>();
  private info = new Map<string, AcpInfo>();
  // Minted locally, like every other remote process id: routing by id makes a chunk still in flight
  // from a session `acp reset` disposed land on a detached listener rather than in its successor.
  private remoteCounter = 0;

  constructor(private managers: Managers) {}

  // Whether a tab has a connected (or connecting) ACP session. Drives the connections panel and completion.
  has(label: string): boolean {
    return this.sessions.has(label);
  }

  // The `provider/model` (or bare `model`) string for a tab's session, or undefined when none is
  // connected. Display-only; populated on the connection handshake.
  label(label: string): string | undefined {
    const info = this.info.get(label);
    if (!info) return undefined;
    return info.provider ? `${info.provider}/${info.model ?? ''}` : info.model;
  }

  // The tab's ACP session, connecting one on first use and reusing it thereafter. A local tab's
  // agent runs in `cwd`; a remote tab's runs on the other machine, inside the workspace clone that
  // host provisioned, so `cwd` does not apply to it. `hooks.onConnect` fires after the handshake, by
  // which point the session's model info is recorded (so `label` resolves).
  session(label: string, cwd: string, hooks: ConnectHooks): AcpSession {
    let session = this.sessions.get(label);
    if (!session) {
      const info = parseModel(ACP_MODEL);
      const tab = this.managers.tab.tabs.find((t) => t.label === label);
      const connect: ConnectHooks = {
        onError: hooks.onError,
        onConnect: () => { this.info.set(label, info); hooks.onConnect(); },
      };
      const channel = tab?.remote ? this.managers.remote.get(label) : undefined;
      session = channel
        ? createRemoteAcpSession(channel, { ...acpLaunch(), id: `racp${++this.remoteCounter}`, offline: tab?.offline }, connect)
        : connectAcp({
          ...acpLaunch(), cwd,
          onError: connect.onError,
          onConnect: connect.onConnect,
          workspaceDir: tab?.workspaceDir,
          offline: tab?.offline,
        });
      this.sessions.set(label, session);
    }
    return session;
  }

  // Kill and forget a tab's session (and its info). Returns whether one was open — the
  // `connection close acp` path re-renders and reports only when it actually closed one.
  close(label: string): boolean {
    const session = this.sessions.get(label);
    if (!session) return false;
    session.kill();
    this.sessions.delete(label);
    this.info.delete(label);
    return true;
  }

  // Kill every session and forget all info (app shutdown).
  closeAll(): void {
    for (const [, session] of this.sessions) session.kill();
    this.sessions.clear();
    this.info.clear();
  }

  dispose(): void {
    this.closeAll();
  }

  // A remote tab whose ssh channel has not finished authenticating yet. Its channel entry exists
  // well before the handshake lands, so a prompt sent now would be dropped on the floor.
  private stillConnecting(label: string): boolean {
    const tab = this.managers.tab.tabs.find((t) => t.label === label);
    if (!tab?.remote) return false;
    const channel = this.managers.remote.get(label);
    return channel !== undefined && !channel.attached;
  }

  run(label: string, command: string, onDone?: (output: string) => void): void {
    const prompt = command.replace(/^acp\b\s*/i, '').trim();
    if (!prompt) { this.managers.tab.append(label, { input: command, output: 'Usage: acp <prompt>.' }); return; }
    if (this.stillConnecting(label)) {
      this.managers.tab.append(label, { input: command, output: STILL_CONNECTING });
      onDone?.(STILL_CONNECTING);
      return;
    }

    const session = this.session(label, this.managers.tab.cwdOf(label) ?? process.cwd(), {
      // A connection-level error means the session no longer exists, so it is forgotten as well as
      // reported: the next `acp` prompt spawns a fresh one rather than writing into a corpse. The
      // loop's own prompt-level errors (a rate limit, most importantly) deliberately do not come
      // here, so a session that merely failed a prompt keeps its accumulated conversation.
      onError: (m) => {
        this.managers.tab.append(label, { input: '', output: `ACP: ${m}` });
        this.close(label);
      },
      onConnect: () => messageBus.emit('state', { type: 'dirty' }),
    });

    const updateRunning = makeUpdateRunning(label, this.managers);

    const tools = createAcpToolTable(this.managers);

    let lastAnswer = '';
    runAcpToolLoop(session, prompt, {
      primer: `${toolPrimer(tools)}\n\n${MARKDOWN_INSTRUCTION}`,
      runCommand: toolRunner(tools, label),
      extractCommand: toolExtractor(tools),
    }, {
      startTurn: (isFirst) => { this.managers.tab.addBusy(label); if (isFirst) notify(this.managers, 'agent-start', label); this.managers.tab.append(label, { input: isFirst ? prompt : '', output: '', running: true, markdown: true }); },
      chunk: (buffer) => updateRunning(buffer, true),
      endTurn: (final) => { updateRunning(final, false); lastAnswer = final; },
      ranCommand: (c, result) => this.managers.tab.append(label, { input: c, output: result, acp: true }),
      finished: (reason, maxSteps) => {
        this.managers.tab.deleteBusy(label);
        notify(this.managers, 'state-change', label);
        if (isRateLimitError(lastAnswer)) notify(this.managers, 'rate-limited', label);
        if (reason === 'capped') this.managers.tab.append(label, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
        messageBus.emit('state', { type: 'dirty' });
        onDone?.(lastAnswer);
      },
      error: (m) => { updateRunning(`ACP error: ${m}`, false); this.managers.tab.deleteBusy(label); notify(this.managers, 'state-change', label); if (isRateLimitError(m)) notify(this.managers, 'rate-limited', label); onDone?.(`ACP error: ${m}`); },
    });
  }
}
