import { randomUUID } from 'node:crypto';
import type { LogEntry, MonitorTarget } from '../tab/types.js';
import type { Subscription } from '../bus.js';
import type { Persona } from '../personas.js';
import { parseSuggestion } from './reply-format.js';
import { monitorFirstPrompt } from './session.js';
import { targetColor, formatTargets } from './targets.js';
import { flushFeedEntries } from './feeds.js';
import { frameUpdatePrompt } from './framing.js';
import { recordContext, type MonitorContextEntry } from './context.js';
import { recordReply } from './reply.js';
import { pushSuggestion, updateMonitorMeta } from './window.js';
import { notify } from '../notifications/index.js';
import { isRateLimitError } from '../acp/rate-limit.js';
import { buildSuggestion, formatInlineSuggestion } from './suggestion.js';
import type { Managers } from '../managers.js';
import { errorText } from '../error-text.js';

export type MonitorSub = {
  owner: string;
  // The monitor's runtime identity, distinct from its persona (Decision 13): the map key, the
  // reporting-tab label, and what a relaunch-refresh matches on. Defaults to the persona name for a
  // monitor started without one (the interactive `monitor` command), preserving one-per-persona.
  name: string;
  inline: boolean;
  persona: Persona;
  targets: MonitorTarget[];
  buffer: { tabLabel: string; entry: LogEntry }[];
  // Per-harness-target count of session-transcript entries already fed, so each monitor advances its
  // own cursor through the tab's accumulated transcript (see monitor-harness-transcript-feed).
  harnessTranscriptSeen: Map<string, number>;
  // Per-harness-target last-fed capture time, so an unchanged screen is not re-fed (see monitor-harness-feed).
  harnessSeen: Map<string, number>;
  // Per-editor-target last-fed file content, so an unchanged file is not re-fed and a changed one is
  // diffed against what this monitor last saw (see monitor-editor-feed).
  editorSeen: Map<string, string>;
  // Per-page-target last-fed visible-text content, so an unchanged page is not re-fed and a
  // changed one is diffed against what this monitor last saw (see monitor-page-tab-content-feed).
  pageSeen: Map<string, string>;
  // Random, per-session token every buffered entry is wrapped in (see monitor/framing.ts), so the
  // persona can tell monitored content apart from its own instructions.
  delimiter: string;
  // The persona's instructions, reply format and trust framing. Prepended to the next prompt on
  // the owner tab's core role session, then cleared once that prompt is answered; a reset or a
  // failed first prompt puts it back so the next core session is primed again.
  firstPrompt: string;
  // The core session that last answered this monitor's prompt. A different identity on a later
  // answered result means another surface closed and reopened the shared role session, so the
  // reply must be discarded and the new session re-primed on the next flush.
  coreSession?: string;
  inFlight: boolean;
  // Incrementing generation for reporting-tab resets. A flush captures it at send time; a failed
  // result from an older generation is the close settling that flush, not a real failure.
  resetGeneration: number;
  delivered: number;
  // Running total of bytes sent/received on this monitor's core prompts, reset on an explicit reset.
  contextBytes: number;
  // The accumulated context text itself (first prompt, update prompts, asks, replies), kept in
  // order so it can be snapshotted into a view tab. Grows and resets with `contextBytes`.
  contextText: MonitorContextEntry[];
  timer: ReturnType<typeof setInterval>;
  subs: Subscription[];
};

export type MonitorSubSetup = Omit<MonitorSub, 'timer'>;

// The live monitors and the core role prompts each one drives, keyed by `${ownerLabel}:${name}`:
// batched on the flush timer and delivered into the owner tab's transcript or the persona's
// reporting tab. `MonitorManager` owns the rest of a monitor's life — starting it, stopping it,
// and the listings — so this half reads as the prompting side of a monitor.

export class LiveMonitors {
  protected readonly monitors = new Map<string, MonitorSub>();
  private counter = 0;

  constructor(protected readonly managers: Managers) {}

  // Whether `reg` is still registered. A core prompt settles asynchronously, so a result from a
  // monitor that was stopped in the meantime must not deliver a suggestion or append an error.
  protected isCurrent(reg: MonitorSub): boolean {
    return this.monitors.get(`${reg.owner}:${reg.name}`) === reg;
  }

  // A core prompt failed or was refused. Surface it on the existing monitor error line; core owns
  // model fallback and session lifecycle, so there is no local process to respawn here.
  private promptFailed(reg: MonitorSub, message: string): void {
    this.managers.tab.append(reg.owner, { input: '', output: `monitor ${reg.persona.name}: ${message} — restarting monitor session` });
    if (isRateLimitError(message)) notify(this.managers, 'rate-limited', reg.owner);
  }

  // The reporting tab's reset button: close the tab's core session for this role and start the
  // monitor's context over. The next prompt re-sends the persona's first prompt on a fresh core
  // session; no monitor process is killed here.
  protected reset(reg: MonitorSub): void {
    if (!this.isCurrent(reg)) return;
    reg.resetGeneration += 1;
    this.managers.acp.close(reg.owner, undefined, reg.persona.role);
    reg.contextBytes = 0;
    reg.contextText = [];
    reg.firstPrompt = monitorFirstPrompt(reg.persona, reg.delimiter);
    delete reg.coreSession;
    recordContext(reg, reg.firstPrompt, 'input');
    if (!reg.inline) updateMonitorMeta(this.managers, reg.name, formatTargets(reg.targets), reg.contextBytes);
  }

  // The 30-second batch. No new transcripts → no ACP query at all; also skipped while a previous
  // core prompt (flush or ask) is still outstanding.
  protected flush(key: string): void {
    const reg = this.monitors.get(key);
    if (!reg || reg.inFlight) return;
    // Harness tabs never emit `entry:appended`, so top up from their rendered screen here — the
    // live channel for harness targets. An idle harness yields nothing, keeping the "no new
    // content → no ACP prompt" guarantee below intact.
    reg.buffer.push(...flushFeedEntries(this.managers, reg.targets, reg));
    if (reg.buffer.length === 0) return;
    const batch = reg.buffer;
    reg.buffer = [];
    const framed = frameUpdatePrompt(batch, reg.delimiter);
    recordContext(reg, framed, 'input');
    const prompt = reg.firstPrompt ? `${reg.firstPrompt}\n\n${framed}` : framed;
    const generation = reg.resetGeneration;
    reg.inFlight = true;
    void this.managers.acp.promptResult(reg.owner, prompt, reg.persona.role, { appendRefusalToTranscript: false }).then(
      (result) => {
        if (!this.isCurrent(reg)) return;
        reg.inFlight = false;
        if (!result.answered) {
          if (generation === reg.resetGeneration) this.promptFailed(reg, result.error);
          return;
        }
        if (generation !== reg.resetGeneration) return;
        if (reg.coreSession !== undefined && reg.coreSession !== result.session) {
          reg.coreSession = result.session;
          reg.firstPrompt = monitorFirstPrompt(reg.persona, reg.delimiter);
          return;
        }
        reg.coreSession = result.session;
        reg.firstPrompt = '';
        recordReply(reg, this.managers, result.reply);
        const suggestion = parseSuggestion(result.reply);
        if (suggestion) this.deliver(reg, batch.at(-1)!.tabLabel, suggestion);
      },
      (error: unknown) => {
        if (!this.isCurrent(reg)) return;
        reg.inFlight = false;
        if (generation === reg.resetGeneration) this.promptFailed(reg, errorText(error));
      },
    );
  }

  protected deliver(reg: MonitorSub, about: string, parsed: { text: string; command?: string }): void {
    reg.delivered += 1;
    const suggestion = buildSuggestion(parsed, reg.persona.name, about, `s-${++this.counter}`);
    if (reg.inline) {
      this.managers.tab.append(reg.owner, { input: '', background: randomUUID(), output: formatInlineSuggestion(reg.persona.name, suggestion) });
      return;
    }
    pushSuggestion(this.managers, reg.name, reg.persona.name, targetColor(this.managers.tab.tabs, reg.targets), suggestion);
  }
}
