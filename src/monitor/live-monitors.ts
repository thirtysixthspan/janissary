import type { AcpInfo, AcpSession } from '../acp/types.js';
import type { LogEntry, MonitorTarget } from '../tab/types.js';
import type { Subscription } from '../bus.js';
import type { Persona } from '../personas.js';
import { parseSuggestion } from './reply-format.js';
import { openMonitorSession, respawnMonitorSession } from './session.js';
import type { spawnMonitorSession } from './acp.js';
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
  session: AcpSession;
  info?: AcpInfo;
  inFlight: boolean;
  delivered: number;
  // Running total of bytes sent/received on this session (priming, flushes, asks) — reset on respawn.
  contextBytes: number;
  // The accumulated context text itself (priming, update prompts, asks, replies), kept in order so
  // it can be snapshotted into a view tab. Grows and resets in lockstep with `contextBytes`.
  contextText: MonitorContextEntry[];
  timer: ReturnType<typeof setInterval>;
  subs: Subscription[];
};

export type MonitorSubSetup = Omit<MonitorSub, 'session' | 'timer'>;

// The live monitors and the session each one runs, keyed by `${ownerLabel}:${name}`: opened and
// primed, respawned when a prompt fails, batched on the flush timer, and delivered into the owner
// tab's transcript or the persona's reporting tab. `MonitorManager` owns the rest of a monitor's
// life — starting it, stopping it, and the listings — so this half reads as the session itself.

export class LiveMonitors {
  protected readonly monitors = new Map<string, MonitorSub>();
  private counter = 0;

  constructor(
    protected readonly managers: Managers,
    protected readonly spawn: typeof spawnMonitorSession,
  ) {}

  // Spawn the monitor's dedicated session and prime it with the persona body + reply
  // format; `inFlight` holds flushes off until priming settles.
  protected openSession(reg: MonitorSub): void {
    openMonitorSession(reg, this.managers, this.spawn);
  }

  // Whether `reg` is still registered and still running on `session`. A local session keeps
  // delivering a pending prompt's callbacks after `kill()`, so a callback from a monitor that was
  // stopped or whose session was replaced must not act on it.
  protected isCurrent(reg: MonitorSub, session: AcpSession): boolean {
    return this.monitors.get(`${reg.owner}:${reg.name}`) === reg && reg.session === session;
  }

  // A prompt failed (typically the ACP subprocess died). Replace the session with a
  // fresh, re-primed one so the monitor recovers instead of staying dead. A no-op for a
  // stopped monitor or a session already replaced, so no untracked subprocess is spawned.
  protected respawn(reg: MonitorSub, session: AcpSession = reg.session): void {
    if (!this.isCurrent(reg, session)) return;
    respawnMonitorSession(reg, this.managers, this.spawn);
    if (!reg.inline) updateMonitorMeta(this.managers, reg.name, formatTargets(reg.targets), reg.contextBytes);
  }

  // The 30-second batch. No new transcripts → no ACP query at all; also skipped while a
  // previous prompt (including the persona priming) is still streaming.
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
    const prompt = frameUpdatePrompt(batch, reg.delimiter);
    recordContext(reg, prompt, 'input');
    reg.inFlight = true;
    let reply = '';
    const session = reg.session;
    // A stale callback leaves `inFlight` alone too: a replacement session's priming owns the slot.
    session.prompt(prompt, {
      onChunk: (text) => { reply += text; },
      onEnd: () => {
        if (!this.isCurrent(reg, session)) return;
        reg.inFlight = false;
        recordReply(reg, this.managers, reply);
        const suggestion = parseSuggestion(reply);
        if (suggestion) this.deliver(reg, batch.at(-1)!.tabLabel, suggestion);
      },
      onError: (message) => {
        if (!this.isCurrent(reg, session)) return;
        this.managers.tab.append(reg.owner, { input: '', output: `monitor ${reg.persona.name}: ${message} — restarting monitor session` });
        if (isRateLimitError(message)) notify(this.managers, 'rate-limited', reg.owner);
        this.respawn(reg, session);
      },
    });
  }

  protected deliver(reg: MonitorSub, about: string, parsed: { text: string; command?: string }): void {
    reg.delivered += 1;
    const suggestion = buildSuggestion(parsed, reg.persona.name, about, `s-${++this.counter}`);
    if (reg.inline) {
      this.managers.tab.append(reg.owner, { input: '', output: formatInlineSuggestion(reg.persona.name, suggestion) });
      return;
    }
    pushSuggestion(this.managers, reg.name, reg.persona.name, targetColor(this.managers.tab.tabs, reg.targets), suggestion);
  }
}
