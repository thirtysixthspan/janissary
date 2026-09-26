import type { MonitorTarget } from '../tab/types.js';
import { loadPersona, type Persona } from '../personas.js';
import { openMonitorTab, updateMonitorMeta } from './window.js';
import { rateSuggestion } from './suggestions.js';
import { createMonitorSession, primeMonitorSession } from './session.js';
import { spawnMonitorSession } from './acp.js';
import { validateTargets, targetColor, formatTargets, resolveTargetAliases } from './targets.js';
import { stopMonitor, closeIfUnfed } from './stop.js';
import { seedFeedEntries } from './feeds.js';
import { generateSessionDelimiter } from './framing.js';
import { snapshotMonitorContext, formatContext } from './context.js';
import { listMonitors, monitorConnections, monitorNames } from './info.js';
import { askMonitor } from './ask.js';
import type { ConnectionView } from '../protocol.js';
import type { Managers } from '../managers.js';
import { LiveMonitors, type MonitorSub, type MonitorSubSetup } from './live-monitors.js';
import { subscribeMonitor } from './subscriptions.js';
import { errorText } from '../error-text.js';

export const MONITOR_FLUSH_MS = 30_000;

// Owns all live monitors, keyed by `${ownerLabel}:${name}`. Each monitor is a
// dedicated, tool-less ACP session primed with its persona; transcript entries from its
// targets buffer up and flush as one prompt every 30s (never when the buffer is empty,
// never while a previous prompt is still streaming). Suggestions route to the owner
// tab's transcript (inline mode) or the persona's reporting tab (external mode).
export class MonitorManager extends LiveMonitors {
  constructor(
    managers: Managers,
    spawn: typeof spawnMonitorSession = spawnMonitorSession,
    private flushMs: number = MONITOR_FLUSH_MS,
  ) {
    super(managers, spawn);
  }

  // Start a monitor; returns an error message, or null on success. No targets = inline
  // mode (watch the owner tab, report into its transcript).
  start(owner: string, personaName: string, targets: MonitorTarget[], name: string = personaName): string | null {
    const key = `${owner}:${name}`;
    // The collision is on the name, which is the registry key. Two monitors may share a persona as
    // long as their names differ.
    if (this.monitors.has(key)) return `Already monitoring as "${name}".`;
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
      return errorText(error);
    }

    const setup: MonitorSubSetup = {
      owner, name, inline, persona, targets: resolved, buffer: [], harnessTranscriptSeen: new Map(), harnessSeen: new Map(), editorSeen: new Map(), pageSeen: new Map(), delimiter: generateSessionDelimiter(), inFlight: true, delivered: 0,
      contextBytes: 0, contextText: [],
      subs: [],
    };
    const session = createMonitorSession(setup, this.managers, this.spawn);
    const reg: MonitorSub = { ...setup, session, timer: setInterval(() => this.flush(key), this.flushMs) };
    primeMonitorSession(reg);
    this.subscribe(key, reg);
    reg.buffer.push(...seedFeedEntries(this.managers, this.managers.tab.tabs, resolved, reg));
    this.monitors.set(key, reg);
    // External mode: open the reporting tab right away (empty feed) so starting the
    // monitor is visible immediately, not only when the first suggestion lands.
    if (!inline) {
      openMonitorTab(this.managers, name, persona.name, targetColor(this.managers.tab.tabs, resolved));
      updateMonitorMeta(this.managers, name, formatTargets(resolved), reg.contextBytes);
    }
    return null;
  }

  // Wire the monitor's bus subscriptions: the owner tab closing, the whole monitor stopping, and
  // one target leaving the set.
  private subscribe(key: string, reg: MonitorSub): void {
    subscribeMonitor(
      key, reg, this.managers,
      (owner) => this.handleOwnerClosed(owner),
      (owner, name) => this.stop(owner, name),
      (owner, name, label) => this.stop(owner, name, { kind: 'tab', label }),
    );
  }

  // Query a running monitor's ACP session directly; the reply lands in the owner tab's
  // transcript. Shares the `inFlight` slot with flushes, so a question never interleaves
  // with a monitor-update prompt. Returns an error message, or null when the question is
  // on its way.
  // Keyed on the runtime name, the same key `stop` uses and the same one `start` registered under —
  // a monitor a profile named cannot otherwise be addressed at all.
  ask(owner: string, name: string, question: string): string | null {
    const reg = this.monitors.get(`${owner}:${name}`);
    if (!reg) return `No "${name}" monitor running from this tab.`;
    if (reg.inFlight) return `The ${name} monitor is busy; try again in a moment.`;
    const session = reg.session;
    askMonitor(reg, owner, name, question, this.managers, () => this.respawn(reg, session));
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

  // The formatted context text for `name`'s monitor, for the connections-panel transcript button
  // (see controller/transcript.ts). `''` when no such monitor is running or it has no context yet.
  transcript(name: string): string {
    const reg = [...this.monitors.values()].find((r) => !r.inline && r.name === name);
    return reg ? formatContext(reg.contextText) : '';
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

  // Runtime names of a tab's monitors, for completing `unmonitor` and `monitor ask`.
  namesFor(owner: string): string[] {
    return monitorNames(this.monitors.values(), owner);
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

  dispose(): void {
    this.closeAll();
  }
}
