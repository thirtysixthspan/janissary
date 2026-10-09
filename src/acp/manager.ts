import { AcpSessionManager } from './session-manager.js';
import { runAcpToolLoop } from './loop.js';
import { guardAcpHandlers } from './guard-handlers.js';
import { appendAcp, settleAcpPrompt } from './response.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { isRateLimitError } from './rate-limit.js';
import { createAcpToolTable, toolPrimer, toolRunner, toolExtractor } from './tool-table.js';
import { MARKDOWN_INSTRUCTION } from './launch.js';
import { modelsFor } from '../harness/models.js';
import { errorText } from '../error-text.js';

// The model a tab's core ACP session prefers. A preference, not a fixed choice: the pair is
// resolved against the harness catalog the other three ACP entry points already read, so a project
// that overrides `.janissary/harness-models.json` gets a model from its own list.
const PREFERRED_ACP_MODEL = 'google/gemini-3.1-flash-lite';

// Refused rather than queued: `RemoteChannel.send` silently drops every frame until ssh has
// authenticated and the handshake has landed, so a prompt typed into a provisioning tab would hang
// forever with the busy dot lit. Every core tab ACP entry point checks readiness; the caller can
// retry once the remote workspace is ready.
const STILL_CONNECTING = 'ACP: the remote session is still connecting.';

// An override can leave nothing to run. Refused with a message rather than launched with a model the
// catalog does not offer, which would fail later and less clearly.
const NO_ACP_MODEL = 'ACP: no opencode model is available in the harness catalog.';

// The opencode model to launch with: the preferred one while the catalog still lists it, the first
// one it does offer otherwise, and nothing at all for an empty list.
function resolveAcpModel(): string | undefined {
  const available = modelsFor('opencode');
  if (available.includes(PREFERRED_ACP_MODEL)) return PREFERRED_ACP_MODEL;
  return available[0];
}

export class AcpManager extends AcpSessionManager {
  // Tabs whose session was asked for without a tool table. Held against the tab rather than the
  // session: the request describes what that tab may run, so a session that dies is replaced by one
  // held to the same rule, and only the tab's own release forgets it.
  private withoutTools = new Set<string>();

  start(label: string, request?: { withoutTools?: true }): { model?: string; error?: string } {
    if (this.stillConnecting(label)) return { error: STILL_CONNECTING };
    const model = resolveAcpModel();
    if (!model) return { error: NO_ACP_MODEL };
    if (request?.withoutTools === true) this.withoutTools.add(label);
    try {
      this.session(label, this.managers.tab.cwdOf(label) ?? process.cwd(), model, {
        onError: (message) => {
          appendAcp(this.managers, label, { input: '', output: `ACP: ${message}` });
          this.close(label, `ACP: ${message}`);
        },
        onConnect: () => messageBus.emit('state', { type: 'dirty' }),
      });
      return { model };
    } catch (error) {
      const output = `ACP error: ${errorText(error)}`;
      appendAcp(this.managers, label, { input: '', output });
      this.close(label, output);
      return { error: output };
    }
  }

  prompt(label: string, command: string): Promise<string> {
    const tab = this.managers.tab.byLabel(label);
    if (!tab) return Promise.resolve('Tab not found');
    tab.runtime ??= { busy: false, context: [], queue: [] };
    if (tab.runtime.acpPrompt) {
      const output = 'ACP: a prompt is already running.';
      appendAcp(this.managers, label, { input: command, output });
      return Promise.resolve(output);
    }
    return new Promise((finish) => {
      const pending = { finish, abort: new AbortController() };
      tab.runtime!.acpPrompt = pending;
      try {
        this.run(label, command, (output) => {
          if (tab.runtime?.acpPrompt === pending) settleAcpPrompt(this.managers, label, output);
        });
      } catch (error) {
        const output = `ACP error: ${errorText(error)}`;
        appendAcp(this.managers, label, { input: command, output });
        this.close(label, output);
      }
    });
  }

  // A remote tab whose ssh channel has not finished authenticating yet. Its channel entry exists
  // well before the handshake lands, so a prompt sent now would be dropped on the floor.
  private stillConnecting(label: string): boolean {
    const tab = this.managers.tab.byLabel(label);
    if (!tab?.remote) return false;
    const channel = this.managers.remote.get(label);
    return channel !== undefined && !channel.attached;
  }

  // The tab's own release is the one place the rule is forgotten, so a recycled label never
  // inherits the restriction the tab that held it before was started under.
  override closeTab(label: string): void {
    this.withoutTools.delete(label);
    super.closeTab(label);
  }

  override closeAll(): void {
    this.withoutTools.clear();
    super.closeAll();
  }

  run(label: string, command: string, onDone?: (output: string) => void): void {
    const prompt = command.replace(/^acp\b\s*/i, '').trim();
    if (!prompt) {
      const output = 'Usage: acp <prompt>.';
      appendAcp(this.managers, label, { input: command, output });
      onDone?.(output);
      return;
    }
    if (this.stillConnecting(label)) {
      appendAcp(this.managers, label, { input: command, output: STILL_CONNECTING });
      onDone?.(STILL_CONNECTING);
      return;
    }
    const model = resolveAcpModel();
    if (!model) {
      appendAcp(this.managers, label, { input: command, output: NO_ACP_MODEL });
      onDone?.(NO_ACP_MODEL);
      return;
    }

    const session = this.session(label, this.managers.tab.cwdOf(label) ?? process.cwd(), model, {
      // A connection-level error means the session no longer exists, so it is forgotten as well as
      // reported: the next `acp` prompt spawns a fresh one rather than writing into a corpse. The
      // loop's own prompt-level errors (a rate limit, most importantly) deliberately do not come
      // here, so a session that merely failed a prompt keeps its accumulated conversation.
      onError: (m) => {
        appendAcp(this.managers, label, { input: '', output: `ACP: ${m}` });
        this.close(label, `ACP: ${m}`);
      },
      onConnect: () => messageBus.emit('state', { type: 'dirty' }),
    });
    const request = this.managers.tab.byLabel(label)?.runtime?.acpPrompt;

    const updateRunning = (output: string, running: boolean) => {
      this.managers.tab.updateRunning(label, { markdown: true }, output, running, {
        trailing: true,
      });
    };

    // A tool-less session builds no tool table at all, which is the whole enforcement: the primer
    // grows no tool text, no reply line is recognized as a command, and `toolRunner` has nothing to
    // resolve an emitted command to.
    const tools = this.withoutTools.has(label) ? [] : createAcpToolTable(this.managers, request?.abort.signal);

    let lastAnswer = '';
    runAcpToolLoop(session, prompt, {
      signal: request?.abort.signal,
      primer: [toolPrimer(tools), MARKDOWN_INSTRUCTION].filter(Boolean).join('\n\n'),
      runCommand: toolRunner(tools, label),
      extractCommand: toolExtractor(tools),
    }, guardAcpHandlers({
      startTurn: (isFirst) => { this.managers.tab.addBusy(label); if (isFirst) notify(this.managers, 'agent-start', label); appendAcp(this.managers, label, { input: isFirst ? prompt : '', output: '', running: true, markdown: true }); },
      chunk: (buffer) => updateRunning(buffer, true),
      endTurn: (final) => { updateRunning(final, false); lastAnswer = final; },
      ranCommand: (c, result) => appendAcp(this.managers, label, { input: c, output: result, acp: true }),
      finished: (reason, maxSteps) => {
        this.managers.tab.deleteBusy(label);
        notify(this.managers, 'state-change', label);
        if (isRateLimitError(lastAnswer)) notify(this.managers, 'rate-limited', label);
        if (reason === 'capped') appendAcp(this.managers, label, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
        messageBus.emit('state', { type: 'dirty' });
        onDone?.(lastAnswer);
      },
      error: (m) => { updateRunning(`ACP error: ${m}`, false); this.managers.tab.deleteBusy(label); notify(this.managers, 'state-change', label); if (isRateLimitError(m)) notify(this.managers, 'rate-limited', label); onDone?.(`ACP error: ${m}`); },
    }, () => this.isCurrent(label, session)
      && (request === undefined || this.managers.tab.byLabel(label)?.runtime?.acpPrompt === request)));
  }
}
