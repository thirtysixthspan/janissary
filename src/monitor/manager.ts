import type { AcpInfo, AcpSession, LogEntry, MonitorTarget } from '../types.js';
import type { Subscription } from '../bus.js';
import { messageBus } from '../bus.js';
import { loadPersona, type Persona } from '../personas.js';
import { parseSuggestion } from './parsing.js';
import { openMonitorTab, pushSuggestion, rateSuggestion, updateMonitorMeta } from './window.js';
import { openMonitorSession, respawnMonitorSession } from './session.js';
import { spawnMonitorSession } from './acp.js';
import { validateTargets, matchesTargets, targetColor, formatTargets, resolveTargetAliases } from './targets.js';
import { stopMonitor, closeIfUnfed } from './stop.js';
import { seedFeedEntries, flushFeedEntries } from './feeds.js';
import { generateSessionDelimiter, frameEntry } from './framing.js';
import { recordContext, snapshotMonitorContext, type MonitorContextEntry } from './context.js';
import { listMonitors, monitorConnections } from './info.js';
import { askMonitor } from './ask.js';
import { recordReply } from './reply.js';
import type { ConnectionView } from '../protocol.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications.js';
import { isRateLimitError } from '../acp/rate-limit.js';
import { SUGGESTION_PREFIX, buildSuggestion, formatInlineSuggestion } from './suggestion.js';

export { SUGGESTION_PREFIX } from './suggestion.js';

export const MONITOR_FLUSH_MS = 30_000;

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

// Owns all live monitors, keyed by `${ownerLabel}:${name}`. Each monitor is a
// dedicated, tool-less ACP session primed with its persona; transcript entries from its
// targets buffer up and flush as one prompt every 30s (never when the buffer is empty,
// never while a previous prompt is still streaming). Suggestions route to the owner
// tab's transcript (inline mode) or the persona's reporting tab (external mode).
export class MonitorManager {
  private monitors = new Map<string, MonitorSub>();
  private counter = 0;

  constructor(
    private managers: Managers,
    private spawn: typeof spawnMonitorSession = spawnMonitorSession,
    private flushMs: number = MONITOR_FLUSH_MS,
  ) {}

  // Start a monitor; returns an error message, or null on success. No targets = inline
  // mode (watch the owner tab, report into its transcript).
  start(owner: string, personaName: string, targets: MonitorTarget[], name: string = personaName): string | null {
    const key = `${owner}:${name}`;
    if (this.monitors.has(key)) return `Already monitoring with persona "${personaName}".`;
    const inline = targets.length === 0;
    const resolved: MonitorTarget[] = inline
      ? [{ kind: 'tab', label: owner }]
      : resolveTargetAliases(this.managers.tab.tabs, targets);
    const targetError = validateTargets(this.managers.tab.tabs, name, inline, resolved);
    if (targetError) return targetError;

    let persona: Persona;
    try {
      persona = loadPersona(personaName, 'monitor');
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }

    const reg: MonitorSub = {
      owner, name, inline, persona, targets: resolved, buffer: [], harnessSeen: new Map(), editorSeen: new Map(), pageSeen: new Map(), delimiter: generateSessionDelimiter(), inFlight: true, delivered: 0,
      contextBytes: 0, contextText: [],
      session: undefined as unknown as AcpSession, timer: undefined as unknown as ReturnType<typeof setInterval>, subs: [],
    };
    this.openSession(reg);
    this.subscribe(key, reg);
    reg.buffer.push(...seedFeedEntries(this.managers, this.managers.tab.tabs, resolved, reg));
    reg.timer = setInterval(() => this.flush(key), this.flushMs);
    this.monitors.set(key, reg);
    // External mode: open the reporting tab right away (empty feed) so starting the
    // monitor is visible immediately, not only when the first suggestion lands.
    if (!inline) {
      openMonitorTab(this.managers, name, targetColor(this.managers.tab.tabs, resolved));
      updateMonitorMeta(this.managers, name, formatTargets(resolved), reg.contextBytes);
    }
    return null;
  }

  // Spawn the monitor's dedicated session and prime it with the persona body + reply
  // format; `inFlight` holds flushes off until priming settles.
  private openSession(reg: MonitorSub): void {
    openMonitorSession(reg, this.managers, this.spawn);
  }

  // A prompt failed (typically the ACP subprocess died). Replace the session with a
  // fresh, re-primed one so the monitor recovers instead of staying dead.
  private respawn(reg: MonitorSub): void {
    respawnMonitorSession(reg, this.managers, this.spawn);
    if (!reg.inline) updateMonitorMeta(this.managers, reg.name, formatTargets(reg.targets), reg.contextBytes);
  }

  private subscribe(key: string, reg: MonitorSub): void {
    reg.subs.push(
      messageBus.on('transcript', 'entry:appended', (event) => {
        if (event.type !== 'entry:appended' || !matchesTargets(this.managers.tab.tabs, reg.targets, event.tabLabel)) return;
        // Never feed a monitor its own (or a sibling monitor's) inline suggestions.
        if (event.entry.output.startsWith(SUGGESTION_PREFIX)) return;
        reg.buffer.push({ tabLabel: event.tabLabel, entry: event.entry });
      }),
      messageBus.on('transcript', 'tab:removed', (event) => {
        if (event.type !== 'tab:removed') return;
        if (event.tabLabel === reg.owner) { this.handleOwnerClosed(reg.owner); return; }
        // The reporting tab itself was closed directly: tear the monitor down fully,
        // regardless of remaining targets, so its session doesn't linger and the same
        // owner/persona can be started again.
        if (!reg.inline && event.tabLabel === reg.name) { this.stop(reg.owner, reg.name); return; }
        // Only tab targets drop out; group targets persist (the group may gain new tabs).
        if (reg.targets.some((t) => t.kind === 'tab' && t.label === event.tabLabel)) {
          this.stop(reg.owner, reg.name, { kind: 'tab', label: event.tabLabel });
        }
      }),
    );
  }

  // The 30-second batch. No new transcripts → no ACP query at all; also skipped while a
  // previous prompt (including the persona priming) is still streaming.
  private flush(key: string): void {
    const reg = this.monitors.get(key);
    if (!reg || reg.inFlight) return;
    // Harness tabs never emit `entry:appended`, so top up from their rendered screen here — the
    // live channel for harness targets. An idle harness yields nothing, keeping the "no new
    // content → no ACP prompt" guarantee below intact.
    reg.buffer.push(...flushFeedEntries(this.managers, reg.targets, reg));
    if (reg.buffer.length === 0) return;
    const batch = reg.buffer;
    reg.buffer = [];
    const body = batch
      .map(({ tabLabel, entry }) => frameEntry(tabLabel, entry, reg.delimiter))
      .join('\n\n');
    const prompt = `[Monitor update]\n${body}`;
    recordContext(reg, prompt, 'input');
    reg.inFlight = true;
    let reply = '';
    reg.session.prompt(prompt, {
      onChunk: (text) => { reply += text; },
      onEnd: () => {
        reg.inFlight = false;
        recordReply(reg, this.managers, reply);
        const suggestion = parseSuggestion(reply);
        if (suggestion) this.deliver(reg, batch.at(-1)!.tabLabel, suggestion);
      },
      onError: (message) => {
        this.managers.tab.append(reg.owner, { input: '', output: `monitor ${reg.persona.name}: ${message} — restarting monitor session` });
        if (isRateLimitError(message)) notify(this.managers, 'rate-limited', reg.owner);
        this.respawn(reg);
      },
    });
  }

  private deliver(reg: MonitorSub, about: string, parsed: { text: string; command?: string }): void {
    reg.delivered += 1;
    const suggestion = buildSuggestion(parsed, reg.persona.name, about, `s-${++this.counter}`);
    if (reg.inline) {
      this.managers.tab.append(reg.owner, { input: '', output: formatInlineSuggestion(reg.persona.name, suggestion) });
      return;
    }
    pushSuggestion(this.managers, reg.name, targetColor(this.managers.tab.tabs, reg.targets), suggestion);
  }

  // Query a running monitor's ACP session directly; the reply lands in the owner tab's
  // transcript. Shares the `inFlight` slot with flushes, so a question never interleaves
  // with a monitor-update prompt. Returns an error message, or null when the question is
  // on its way.
  ask(owner: string, personaName: string, question: string): string | null {
    const reg = this.monitors.get(`${owner}:${personaName}`);
    if (!reg) return `No "${personaName}" monitor running from this tab.`;
    if (reg.inFlight) return `The ${personaName} monitor is busy; try again in a moment.`;
    askMonitor(reg, owner, personaName, question, this.managers, () => this.respawn(reg));
    return null;
  }

  // Thumbs up/down on a reporting-tab suggestion (see monitor-window `rateSuggestion`).
  rate(id: string, up: boolean): void {
    rateSuggestion(this.monitors.values(), this.managers, id, up);
  }

  // Reset every monitor feeding `name`'s reporting tab to just its persona context.
  resetContext(name: string): void { for (const reg of this.monitors.values()) if (!reg.inline && reg.name === name) this.respawn(reg); }

  // Open a point-in-time snapshot of `name`'s monitor context in an editor tab (see monitor-context).
  snapshotContext(name: string): void {
    snapshotMonitorContext(this.monitors.values(), this.managers, name);
  }

  // Stop one persona's monitor (or drop a single target from it). Returns false when no
  // such monitor exists.
  stop(owner: string, name: string, target?: MonitorTarget): boolean {
    return stopMonitor(this.monitors, this.managers, owner, name, target);
  }

  // The owning agent tab closed: stop its monitors, and close any reporting tab that no
  // longer has a live monitor feeding it (another tab may still run the same persona).
  private handleOwnerClosed(owner: string): void {
    const names = [...this.monitors.values()]
      .filter((reg) => reg.owner === owner && !reg.inline)
      .map((reg) => reg.name);
    this.stopAll(owner);
    for (const name of names) closeIfUnfed(this.monitors, this.managers, name);
  }

  stopAll(owner: string): number {
    const mine = [...this.monitors.values()].filter((r) => r.owner === owner);
    for (const reg of mine) this.stop(reg.owner, reg.name);
    return mine.length;
  }

  // Lines for the `monitors` command.
  list(): string[] {
    return listMonitors(this.monitors.values());
  }

  // One record per live monitor, for `profile save` to write into the `monitors` key. Distinct from
  // the display-only `list()` strings and never reads the private `monitors` map directly.
  snapshot(): { name: string; persona: string; targets: MonitorTarget[]; inline: boolean }[] {
    return [...this.monitors.values()].map((reg) => ({ name: reg.name, persona: reg.persona.name, targets: reg.targets, inline: reg.inline }));
  }

  // Connections-panel rows for a tab's monitors (e.g. `monitor:security (opencode/…)`).
  connectionsFor(owner: string): ConnectionView[] {
    return monitorConnections(this.monitors.values(), owner);
  }

  closeAll(): void {
    // Snapshot first: `stop` mutates the map while we iterate.
    const all = [...this.monitors.values()];
    for (const reg of all) this.stop(reg.owner, reg.name);
  }
}
