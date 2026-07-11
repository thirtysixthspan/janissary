import type { AcpInfo, AcpSession, LogEntry, MonitorSuggestion, MonitorTarget } from './types.js';
import type { Subscription } from './bus.js';
import { messageBus } from './bus.js';
import { loadPersona, type Persona } from './personas.js';
import { parseSuggestion } from './monitor-parsing.js';
import { openMonitorTab, closeMonitorTab, pushSuggestion, findSuggestion, removeSuggestion, updateMonitorMeta } from './monitor-window.js';
import { openMonitorSession, respawnMonitorSession } from './monitor-session.js';
import { spawnMonitorSession } from './monitor-acp.js';
import { validateTargets, matchesTargets, targetColor, seedEntries, formatTargets } from './monitor-targets.js';
import { harnessFeedEntries } from './monitor-harness-feed.js';
import { listMonitors, monitorConnections } from './monitor-info.js';
import { askMonitor } from './monitor-ask.js';
import type { ConnectionView } from './protocol.js';
import type { Managers } from './managers.js';

export const MONITOR_FLUSH_MS = 30_000;

// Marks inline suggestion entries so monitors never feed on their own output.
export const SUGGESTION_PREFIX = '💡';

export type MonitorSub = {
  owner: string;
  inline: boolean;
  persona: Persona;
  targets: MonitorTarget[];
  buffer: { tabLabel: string; entry: LogEntry }[];
  // Per-harness-target last-fed capture time, so an unchanged screen is not re-fed (see monitor-harness-feed).
  harnessSeen: Map<string, number>;
  session: AcpSession;
  info?: AcpInfo;
  inFlight: boolean;
  delivered: number;
  // Running total of bytes sent/received on this monitor's dedicated ACP session (priming,
  // flush batches, ask questions/replies) — reset to 0 on respawn.
  contextBytes: number;
  timer: ReturnType<typeof setInterval>;
  subs: Subscription[];
};

// Owns all live monitors, keyed by `${ownerLabel}:${persona}`. Each monitor is a
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
  start(owner: string, personaName: string, targets: MonitorTarget[]): string | null {
    const key = `${owner}:${personaName}`;
    if (this.monitors.has(key)) return `Already monitoring with persona "${personaName}".`;
    const inline = targets.length === 0;
    const resolved: MonitorTarget[] = inline ? [{ kind: 'tab', label: owner }] : targets;
    const targetError = validateTargets(this.managers.tab.tabs, personaName, inline, resolved);
    if (targetError) return targetError;

    let persona: Persona;
    try {
      persona = loadPersona(personaName);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }

    const reg: MonitorSub = {
      owner, inline, persona, targets: resolved, buffer: [], harnessSeen: new Map(), inFlight: true, delivered: 0,
      contextBytes: 0,
      session: undefined as unknown as AcpSession, timer: undefined as unknown as ReturnType<typeof setInterval>, subs: [],
    };
    this.openSession(reg);
    this.subscribe(key, reg);
    reg.buffer.push(
      ...seedEntries(this.managers.tab.tabs, resolved),
      ...harnessFeedEntries(this.managers, resolved, reg.harnessSeen),
    );
    reg.timer = setInterval(() => this.flush(key), this.flushMs);
    this.monitors.set(key, reg);
    // External mode: open the reporting tab right away (empty feed) so starting the
    // monitor is visible immediately, not only when the first suggestion lands.
    if (!inline) {
      openMonitorTab(this.managers, personaName, targetColor(this.managers.tab.tabs, resolved));
      updateMonitorMeta(this.managers, personaName, formatTargets(resolved), reg.contextBytes);
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
    if (!reg.inline) updateMonitorMeta(this.managers, reg.persona.name, formatTargets(reg.targets), reg.contextBytes);
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
        if (!reg.inline && event.tabLabel === reg.persona.name) { this.stop(reg.owner, reg.persona.name); return; }
        // Only tab targets drop out; group targets persist (the group may gain new tabs).
        if (reg.targets.some((t) => t.kind === 'tab' && t.label === event.tabLabel)) {
          this.stop(reg.owner, reg.persona.name, { kind: 'tab', label: event.tabLabel });
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
    reg.buffer.push(...harnessFeedEntries(this.managers, reg.targets, reg.harnessSeen));
    if (reg.buffer.length === 0) return;
    const batch = reg.buffer;
    reg.buffer = [];
    const body = batch
      .map(({ tabLabel, entry }) => `[${tabLabel}]\n${entry.input}\n${entry.output}`.trim())
      .join('\n\n');
    const prompt = `[Monitor update]\n${body}`;
    reg.contextBytes += Buffer.byteLength(prompt, 'utf8');
    reg.inFlight = true;
    let reply = '';
    reg.session.prompt(prompt, {
      onChunk: (text) => { reply += text; },
      onEnd: () => {
        reg.inFlight = false;
        reg.contextBytes += Buffer.byteLength(reply, 'utf8');
        if (!reg.inline) updateMonitorMeta(this.managers, reg.persona.name, formatTargets(reg.targets), reg.contextBytes);
        const suggestion = parseSuggestion(reply);
        if (suggestion) this.deliver(reg, batch.at(-1)!.tabLabel, suggestion);
      },
      onError: (message) => {
        this.managers.tab.append(reg.owner, { input: '', output: `monitor ${reg.persona.name}: ${message} — restarting monitor session` });
        this.respawn(reg);
      },
    });
  }

  private deliver(reg: MonitorSub, about: string, parsed: { text: string; command?: string }): void {
    reg.delivered += 1;
    const suggestion: MonitorSuggestion = {
      ...parsed, id: `s-${++this.counter}`, timestamp: Date.now(), persona: reg.persona.name, about,
    };
    if (reg.inline) {
      const command = suggestion.command ? `\n${suggestion.command}` : '';
      this.managers.tab.append(reg.owner, { input: '', output: `${SUGGESTION_PREFIX} ${reg.persona.name}: ${suggestion.text}${command}` });
      return;
    }
    pushSuggestion(this.managers, reg.persona.name, targetColor(this.managers.tab.tabs, reg.targets), suggestion);
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

  // Thumbs up/down on a reporting-tab suggestion. The rating is fed back to the monitor
  // through its normal batched prompt channel (no extra ACP round-trip), so the AI learns
  // what the user found useful. Rating a suggestion means the user is done with it, so
  // either direction removes it from the feed.
  rate(id: string, up: boolean): void {
    const suggestion = findSuggestion(this.managers, id);
    if (!suggestion) return;
    const reg = [...this.monitors.values()].find((r) => !r.inline && r.persona.name === suggestion.persona);
    reg?.buffer.push({
      tabLabel: suggestion.about,
      entry: { input: '', output: `[user feedback] The user rated your suggestion "${suggestion.text}" as ${up ? 'helpful (thumbs up)' : 'not helpful (thumbs down)'}.` },
    });
    removeSuggestion(this.managers, id);
  }

  // Stop one persona's monitor (or drop a single target from it). Returns false when no
  // such monitor exists.
  stop(owner: string, personaName: string, target?: MonitorTarget): boolean {
    const key = `${owner}:${personaName}`;
    const reg = this.monitors.get(key);
    if (!reg) return false;
    if (target && !reg.inline) {
      reg.targets = reg.targets.filter((t) => JSON.stringify(t) !== JSON.stringify(target));
      if (reg.targets.length > 0) {
        updateMonitorMeta(this.managers, personaName, formatTargets(reg.targets), reg.contextBytes);
        return true;
      }
    }
    for (const sub of reg.subs) sub.unsubscribe();
    clearInterval(reg.timer);
    reg.session.kill();
    this.monitors.delete(key);
    if (!reg.inline) this.closeIfUnfed(personaName);
    return true;
  }

  // Close a persona's reporting tab if no live monitor still feeds it (another owner
  // may run the same persona and keep it open).
  private closeIfUnfed(personaName: string): void {
    const stillFed = [...this.monitors.values()].some((r) => !r.inline && r.persona.name === personaName);
    if (!stillFed) closeMonitorTab(this.managers, personaName);
  }

  // The owning agent tab closed: stop its monitors, and close any reporting tab that no
  // longer has a live monitor feeding it (another tab may still run the same persona).
  private handleOwnerClosed(owner: string): void {
    const personas = [...this.monitors.values()]
      .filter((reg) => reg.owner === owner && !reg.inline)
      .map((reg) => reg.persona.name);
    this.stopAll(owner);
    for (const name of personas) this.closeIfUnfed(name);
  }

  stopAll(owner: string): number {
    const mine = [...this.monitors.values()].filter((r) => r.owner === owner);
    for (const reg of mine) this.stop(reg.owner, reg.persona.name);
    return mine.length;
  }

  // Lines for the `monitors` command.
  list(): string[] {
    return listMonitors(this.monitors.values());
  }

  // Connections-panel rows for a tab's monitors (e.g. `monitor:security (opencode/…)`).
  connectionsFor(owner: string): ConnectionView[] {
    return monitorConnections(this.monitors.values(), owner);
  }

  closeAll(): void {
    // Snapshot first: `stop` mutates the map while we iterate.
    const all = [...this.monitors.values()];
    for (const reg of all) this.stop(reg.owner, reg.persona.name);
  }
}
