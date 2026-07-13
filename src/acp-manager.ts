import type { AcpSession, AcpInfo } from './types.js';
import { connectAcp } from './acp.js';
import { runAcpToolLoop } from './acp-loop.js';
import { extractBrowserCommand, BROWSER_PRIMER } from './browser/command.js';
import { messageBus } from './bus.js';
import { notify } from './notifications.js';
import { makeUpdateRunning } from './acp-runner.js';
import type { Managers } from './managers.js';

// The ACP agent the manager connects to and the model it runs. Hardcoded for now (the only provider
// wired up); the model string drives the `provider/model` label shown in the connections panel.
const ACP_COMMAND = 'opencode';
const ACP_ARGS = ['acp'];
const ACP_MODEL = 'google/gemini-3.1-flash-lite';

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

  // The tab's ACP session, connecting one on first use and reusing it thereafter. The agent runs in
  // `cwd`; `hooks.onConnect` fires after the handshake, by which point the session's model info is
  // recorded (so `label` resolves).
  session(label: string, cwd: string, hooks: ConnectHooks): AcpSession {
    let session = this.sessions.get(label);
    if (!session) {
      const info = parseModel(ACP_MODEL);
      const tab = this.managers.tab.tabs.find((t) => t.label === label);
      session = connectAcp({
        command: ACP_COMMAND, args: ACP_ARGS, cwd,
        onError: hooks.onError,
        onConnect: () => { this.info.set(label, info); hooks.onConnect(); },
        env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: ACP_MODEL }) },
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

  run(label: string, command: string, onDone?: (output: string) => void): void {
    const prompt = command.replace(/^acp\b\s*/i, '').trim();
    if (!prompt) { this.managers.tab.append(label, { input: command, output: 'Usage: acp <prompt>.' }); return; }

    const session = this.session(label, this.managers.tab.cwdOf(label) ?? process.cwd(), {
      onError: (m) => this.managers.tab.append(label, { input: '', output: `ACP: ${m}` }),
      onConnect: () => messageBus.emit('state', { type: 'dirty' }),
    });

    const updateRunning = makeUpdateRunning(label, this.managers);

    let lastAnswer = '';
    runAcpToolLoop(session, prompt, {
      primer: `${this.managers.database.primer}\n\n${BROWSER_PRIMER}\n\nWrite your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks, etc.); the tab renders them as formatted Markdown.`,
      runCommand: (c) => (/^browser\b/i.test(c) ? this.managers.browser.run(label, c) : this.managers.database.runInTab(label, c)),
      extractCommand: (t) => extractBrowserCommand(t) ?? this.managers.database.extract(t) ?? null,
    }, {
      startTurn: (isFirst) => { this.managers.tab.addBusy(label); if (isFirst) notify(this.managers, 'agent-start', label); this.managers.tab.append(label, { input: isFirst ? prompt : '', output: '', running: true, markdown: true }); },
      chunk: (buffer) => updateRunning(buffer, true),
      endTurn: (final) => { updateRunning(final, false); lastAnswer = final; },
      ranCommand: (c, result) => this.managers.tab.append(label, { input: c, output: result, acp: true }),
      finished: (reason, maxSteps) => {
        this.managers.tab.deleteBusy(label);
        notify(this.managers, 'state-change', label);
        if (reason === 'capped') this.managers.tab.append(label, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
        messageBus.emit('state', { type: 'dirty' });
        onDone?.(lastAnswer);
      },
      error: (m) => { updateRunning(`ACP error: ${m}`, false); this.managers.tab.deleteBusy(label); notify(this.managers, 'state-change', label); onDone?.(`ACP error: ${m}`); },
    });
  }
}
