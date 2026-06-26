/* eslint-disable max-lines */
import { spawnSync, type ChildProcess } from 'node:child_process';
import type { Tab, LogEntry, ScheduleEntry, AcpSession, AcpInfo, ImageView } from './types.js';
import {
  makeTab, makeImageTab, distinctColor, insertTabInGroup, flattenBuffer, stripComments,
  swapTabsLeft, swapTabsRight,
} from './tab.js';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { openerForExtension } from './openers/index.js';
import { didOsOpen } from './openers/os-open.js';
import { abbreviatePath } from './paths.js';
import type { OpenContext } from './openers/index.js';
import { parseOpen, isGlobPattern } from './commands/open.js';
import { resolveCommand } from './resolve.js';
import { isInteractive } from './interactive.js';
import { parseHarnessCommand, HARNESS_COMMANDS } from './harness.js';
import { parseAgentCommand, resolveAgentName, getOutput } from './commands.js';
import { commands } from './commands/index.js';
import { runDatabaseCommand, parseDatabaseCommand, DB_PRIMER, extractDatabaseCommand } from './database.js';
import { connectAcp } from './acp.js';
import { runAcpToolLoop } from './acp-loop.js';
import { analyzeCommand, toPrefixedCommand, routeChoices } from './recognizers/index.js';
import type { RouteChoice } from './recognizers/types.js';
import { spawnShell, executeShellCmd as executeShellCommand, queryShellPwd } from './shell.js';
import { findRepoRoot, createWorkspace, removeWorkspace } from './workspace.js';
import { completeCommandLine } from './completion.js';
import { appendEntry, getTimeStr as getTimeString } from './logger.js';
import type { CompletionResult } from './types.js';
import { spawnPty, type PtySession } from './pty.js';
import { saveAgentState, loadAgentState, listAgentStates } from './agent-state.js';
import { parseScheduleCommand, formatSchedule, computeNextRun, fmtNextRun } from './schedule.js';
import { parseProfileCommand, loadProfileAgents, listProfiles, profileExists } from './profiles.js';
import { parseConnectionCommand, closeConnection, closeAllConnections, isConnectionOpen, listOpenConnections } from './connections.js';
import { parseMsgCommand as parseMessageCommand, parseBroadcastCommand } from './messaging.js';
import { extractBrowserCommand, BROWSER_PRIMER } from './browser-command.js';
import { MessageBus } from './message-bus.js';
import { BrowserManager } from './browser-tab.js';
import { formatState } from './state-format.js';
import { getConfig } from './config.js';
import type { TabView, ConnectionView, ScheduleView } from './protocol.js';

const SHELL_NAME = (process.env.SHELL || 'bash').split('/').pop() || 'bash';

type Sinks = {
  emitState: () => void;
  sendPty: (id: string, data: string) => void;
  sendPtyExit: (id: string, exitCode: number) => void;
  // Stop the whole app (the `quit` command). Optional so tests can omit it.
  exit?: () => void;
};

export class Controller {
  tabs: Tab[] = [];
  activeTab = 0;
  private shells = new Map<string, ChildProcess>();
  private cwd = new Map<string, string>();
  private busy = new Set<string>();
  private harnessOf = new Map<string, string>();
  private acpSessions = new Map<string, AcpSession>();
  private acpInfo = new Map<string, AcpInfo>();
  private ptys = new Map<string, { session: PtySession; tabLabel: string }>();
  private schedules = new Map<string, ScheduleEntry[]>();
  // SQLite connections (global) attributed to the tab(s) that ran a `db` command against them, so a
  // tab's connections panel reflects only the databases it has opened (mirrors Ink's `tabDbConns`).
  private tabDbConns = new Map<string, string[]>();
  // Informational messages (info/response) received from other agents, per tab, persisted to agent
  // state's `context[]` and shown by the `state` command.
  private context = new Map<string, string[]>();
  // A command awaiting route disambiguation: shown as a chooser overlay in the client, resolved by
  // `chooseRoute`. Null when no chooser is open (only one at a time, like the Ink route chooser).
  private pendingRoute: { label: string; cmd: string; choices: RouteChoice[] } | null = null;
  private cols = 80;
  private rows = 24;
  private timer: ReturnType<typeof setInterval>;
  private bus: MessageBus;
  private browsers = new BrowserManager();
  private workspaces = new Set<string>();
  // The root path: the directory the app was launched from. Transcript paths under it (including the
  // hidden `.janissary` state directory) are abbreviated to `$root` for display. See `shorten`.
  private readonly rootDir = process.cwd();
  // Local files exposed to the web client by an opener (`open <file>`), keyed by a monotonic id. The
  // `/open/<id>` route serves only files in this allow-list — arbitrary paths are never reachable.
  private openFiles = new Map<string, string>();
  private openFileCounter = 0;
  // Most files a single wildcard `open` will act on; extra matches are skipped with a note.
  private static readonly OPEN_MAX_FILES = 10;

  constructor(private sinks: Sinks) {
    this.tabs = [this.makeRootTab()];
    this.cwd.set('janus', process.cwd());
    this.bus = new MessageBus({
      hasAgent: (l) => this.tabs.some((t) => t.label === l),
      agentColor: (l) => this.tabs.find((t) => t.label === l)?.dotColor ?? '#e4e5e7',
      isInteractive,
      appendLog: (l, entry) => this.append(l, entry),
      runShell: (l, command, done) => this.runShell(l, command, { onComplete: done }),
      runCapture: (l, text, callback) => this.runCapture(l, text, callback),
      appendContext: (l, text) => this.appendContext(l, text),
    });
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
  }

  // Restore tabs from persisted agent state (for `--relaunch`). Called before any client connects.
  rehydrate(): void {
    const states = listAgentStates().toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
    if (states.length === 0) return;
    this.tabs = states.map((s, index) => {
      // Preserve each tab's saved `number`; fall back to array order only for state files predating
      // the field (mirrors the Ink rehydration), so the strip reappears exactly as it was left.
      const tab = makeTab(s.name, s.dotColor || distinctColor([]), s.number ?? index + 1, s.cmdHistory ?? [],
        this.capLog((s.log) ?? []), s.workspaceDir, s.group ?? 1, s.groupColor || s.dotColor || '#5b9cff');
      tab.toolStepsExpanded = false;
      return tab;
    });
    for (const s of states) {
      if (s.cwd) this.cwd.set(s.name, s.cwd);
      if (s.schedule) this.schedules.set(s.name, s.schedule);
      if (s.context) this.context.set(s.name, s.context);
    }
    this.activeTab = 0;
  }

  view(): TabView[] {
    return this.tabs.map((t) => ({
      label: t.label, number: t.number, dotColor: t.dotColor, group: t.group, groupColor: t.groupColor,
      busy: this.busy.has(t.label), cwd: this.cwd.get(t.label) ?? process.cwd(),
      harness: this.harnessOf.get(t.label), acp: this.acpLabel(t.label),
      connections: this.connectionsFor(t.label), schedule: this.scheduleFor(t.label),
      // Prompt lines carry the working directory; abbreviate it to `$root`/`~` for display only
      // (the stored cwd stays the real absolute path).
      bufferLines: flattenBuffer(t.log, !t.toolStepsExpanded)
        .map((l) => (l.cwd ? { ...l, cwd: this.shorten(l.cwd) } : l)),
      cmdHistory: t.cmdHistory, toolStepsExpanded: !!t.toolStepsExpanded,
      view: t.view, title: t.title, image: t.image,
    }));
  }

  // The pending route chooser for the client (the command and the option labels), or null. The
  // client picks an index and replies via `chooseRoute`, which maps it back to the route.
  routeView(): { cmd: string; choices: string[] } | null {
    if (!this.pendingRoute) return null;
    return { cmd: this.pendingRoute.cmd, choices: this.pendingRoute.choices.map((c) => c.label) };
  }

  // Resolve an open route chooser: run the chosen route's explicit command in the originating tab,
  // or cancel (index < 0) without running anything. Clears the chooser either way.
  chooseRoute(index: number): void {
    const pending = this.pendingRoute;
    this.pendingRoute = null;
    if (pending && index >= 0 && index < pending.choices.length) {
      const index_ = this.tabs.findIndex((t) => t.label === pending.label);
      if (index_ !== -1) this.run(toPrefixedCommand(pending.cmd, pending.choices[index]), pending.label, index_);
    }
    this.sinks.emitState();
  }

  private acpLabel(label: string): string | undefined {
    const info = this.acpInfo.get(label);
    if (!info) return undefined;
    return info.provider ? `${info.provider}/${info.model ?? ''}` : info.model;
  }

  // Abbreviate an absolute path for display in the transcript: the launch (root) directory and the
  // state directory inside it read as `$root`, and home elsewhere reads as `~`. Display-only — the
  // stored path is unchanged. Used for the connections panel, prompt working directory, and status
  // messages that name a path.
  private shorten(p: string): string {
    return abbreviatePath(p, { root: this.rootDir });
  }

  // The active connections for a tab's floating "connections" panel: its shell + cwd, a
  // connected ACP agent, any inline terminal cards, and every open SQLite database.
  private connectionsFor(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    if (this.shells.has(label)) {
      rows.push({ text: `${SHELL_NAME}:${this.shorten(this.cwd.get(label) ?? process.cwd())}`, kind: 'shell' });
    }
    const acp = this.acpLabel(label);
    if (acp) rows.push({ text: `acp:${acp}`, kind: 'acp' });
    const b = this.browsers.info(label);
    if (b) for (const id of b.ids) rows.push({ text: `browser:${id} (${b.mode})`, kind: 'browser' });
    for (const [, entry] of this.ptys) if (entry.tabLabel === label) rows.push({ text: `terminal:${entry.session.program}`, kind: 'terminal' });
    for (const n of this.openDbsFor(label)) rows.push({ text: `sqlite:${n}`, kind: 'sqlite' });
    return rows;
  }

  // The SQLite databases a tab has opened that are still live (filtered against the registry so a
  // closed/deleted db drops out). Drives the per-tab connections panel and command recognition.
  private openDbsFor(label: string): string[] {
    return (this.tabDbConns.get(label) ?? []).filter(isConnectionOpen);
  }

  private scheduleFor(label: string): ScheduleView[] {
    return (this.schedules.get(label) ?? []).map((e) => ({
      id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring,
    }));
  }

  private cur(): Tab { return this.tabs[this.activeTab] ?? this.tabs[0]; }

  // The fresh root `janus` tab, used at startup and when the last tab is closed.
  private makeRootTab(): Tab {
    const tab = makeTab('janus', distinctColor([]));
    tab.toolStepsExpanded = false;
    return tab;
  }

  // Append a `running` transcript entry and mark the tab busy; the matching call to
  // `finishRunning` fills in its output. Used by async commands (browser, connection-close).
  private startRunning(label: string, input: string): void {
    this.busy.add(label);
    this.append(label, { input, output: '', running: true });
  }

  private finishRunning(label: string, output: string): void {
    const t = this.tabs.find((x) => x.label === label);
    if (t) {
      const log = [...t.log];
      const index = log.findLastIndex((e) => e.running);
      if (index !== -1) log[index] = { ...log[index], output, running: false };
      t.log = log;
      this.busy.delete(label);
      this.persist(t);
    }
    this.log(label, output); // log the finalized output (browser / connection-close results)
    this.sinks.emitState();
  }

  // Cap a tab's transcript to `transcriptMaxLines` (config.json), dropping the oldest entries so
  // the most recent N are kept. Applied at every log-mutation path so transcripts never grow
  // unbounded (mirrors the Ink app's `capLog`).
  private capLog(log: LogEntry[]): LogEntry[] {
    const max = getConfig().transcriptMaxLines;
    return log.length > max ? log.slice(log.length - max) : log;
  }

  private append(label: string, entry: LogEntry): void {
    const tab = this.tabs.find((t) => t.label === label);
    if (!tab) return;
    tab.log = this.capLog([...tab.log, entry]);
    tab.scrollOffset = 0;
    // Record the content in the append-only log (command input + output as separate entries).
    this.log(label, entry.input);
    this.log(label, entry.output);
    this.persist(tab);
    this.sinks.emitState();
  }

  // Append one content event to the append-only log (.janissary/log/<date>.json). No-op for empty
  // text or until initLogDir has run.
  private log(label: string, text: string): void {
    if (text) appendEntry({ timestamp: getTimeString(), agent: label, text });
  }

  // Append an informational message (info/response from another agent) to a tab's context and
  // persist it (mirrors Ink's `appendContext`); surfaced by the `state` command and on `--relaunch`.
  private appendContext(label: string, text: string): void {
    this.context.set(label, [...(this.context.get(label) ?? []), text]);
    const tab = this.tabs.find((t) => t.label === label);
    if (tab) this.persist(tab);
  }

  private persist(tab: Tab): void {
    try {
      saveAgentState({
        name: tab.label, dotColor: tab.dotColor, active: this.busy.has(tab.label),
        number: tab.number, group: tab.group, groupColor: tab.groupColor,
        cmdHistory: tab.cmdHistory, log: tab.log, cwd: this.cwd.get(tab.label),
        context: this.context.get(tab.label), schedule: this.schedules.get(tab.label),
      });
    } catch { /* ignore */ }
  }

  // --- command dispatch ----------------------------------------------------

  dispatch(text: string): void {
    this.run(this.recordHistory(this.activeTab, text), this.cur().label, this.activeTab);
  }

  // Run a command in a specific tab (used by the scheduler) without touching the active tab. The
  // command is recorded in that tab's history "as if typed there" (mirrors the Ink command handler,
  // which records history even for a targeted/scheduled dispatch).
  private dispatchTo(label: string, text: string): void {
    const index = this.tabs.findIndex((t) => t.label === label);
    if (index === -1) return;
    this.run(this.recordHistory(index, text), label, index);
  }

  // Strip comments, append the command to the tab's history (consecutive-dup suppressed, capped at
  // 100), reset the history cursor, and return the cleaned command. Shared by interactive dispatch
  // and scheduled firing so both record history identically.
  private recordHistory(index: number, text: string): string {
    const trimmed = stripComments(text);
    const tab = this.tabs[index];
    if (tab) {
      if (trimmed && tab.cmdHistory.at(-1) !== trimmed) {
        tab.cmdHistory = [...tab.cmdHistory, trimmed].slice(-100);
      }
      tab.cmdHistoryIdx = -1;
    }
    return trimmed;
  }

  private run(input: string, label: string, index: number): void {
    if (/^harness\b/i.test(input)) {
      const parsed = parseHarnessCommand(input);
      if ('error' in parsed) this.append(label, { input, output: parsed.error });
      else this.openPty(label, HARNESS_COMMANDS[parsed.name], parsed.name, parsed.name);
      return;
    }
    const res = resolveCommand(input);
    switch (res.kind) {
      case 'empty': { return;
      }
      case 'shell': {
        if (res.cmd && isInteractive(res.cmd)) this.openPty(label, res.cmd, res.cmd.split(/\s+/, 1)[0]);
        else this.runShell(label, res.cmd);
        return;
      }
      case 'output': { this.append(label, { input, output: res.output, markdown: true }); return;
      }
      case 'unknown': {
        // Probabilistic routing of an unprefixed command (mirrors the Ink command handler). Auto-run
        // a confident non-db route, or a confident db route when exactly one database is open (the
        // query needs a single concrete target). The web UI has no interactive route chooser, so the
        // otherwise-ambiguous cases fall back to a hint asking the user to prefix explicitly.
        const openDbs = this.openDbsFor(label);
        const decision = analyzeCommand(res.cmd, { openDbs });
        if (decision.kind === 'route' && (decision.route !== 'db' || openDbs.length === 1)) {
          const choice: RouteChoice = decision.route === 'db'
            ? { label: '', route: 'db', dbName: openDbs[0] }
            : { label: '', route: decision.route };
          this.run(toPrefixedCommand(res.cmd, choice), label, index);
        } else {
          // Ambiguous (or a db route with 0/multiple open dbs): open the route chooser so the user
          // picks shell / db (per open connection) / acp. Resolved via `chooseRoute`.
          this.pendingRoute = { label, cmd: res.cmd, choices: routeChoices(openDbs) };
          this.sinks.emitState();
        }
        return;
      }
      case 'app': { this.runApp(res.name, res.cmd, label, index); return;
      }
    }
  }

  private runApp(name: string, command: string, label: string, index: number): void {
    switch (name) {
      case 'clear': {
        const tab = this.tabs.find((t) => t.label === label);
        if (tab) { tab.log = []; this.persist(tab); this.sinks.emitState(); }
        return;
      }
      case 'db': { this.append(label, { input: command, output: this.runDbInTab(label, command) }); return;
      }
      case 'agent': { this.newAgent(command); return;
      }
      case 'next': { this.setActiveTab((this.activeTab + 1) % this.tabs.length); return;
      }
      case 'close': { this.closeTab(index); return;
      }
      case 'msg': { this.runMsg(command, label); return;
      }
      case 'broadcast': { this.runBroadcast(command, label); return;
      }
      case 'acp': { this.runAcp(command, label); return;
      }
      case 'state': { this.append(label, { input: command, output: formatState(label, loadAgentState(label) ?? null) }); return;
      }
      case 'schedule': { this.runSchedule(command, label); return;
      }
      case 'profile': { this.runProfile(command, label); return;
      }
      case 'connection': { this.runConnection(command, label); return;
      }
      case 'browser': { this.runBrowser(command, label); return;
      }
      case 'open': { this.runOpen(command, label); return;
      }
      // `quit` and `exit` both close the app window and stop the server. `close` (handled above)
      // is reserved for closing tabs.
      case 'quit': { this.sinks.exit?.(); return;
      }
      // The `hist` picker is interactive (handled client-side via Ctrl+R); reaching the server
      // non-interactively (e.g. scheduled) is a no-op.
      case 'hist': { return;
      }
    }
    const trimmed = command.trim().toLowerCase();
    this.append(label, { 
      input: command, 
      output: getOutput(command) ?? `"${name}" did nothing.`,
      markdown: trimmed === 'help'
    });
  }

  // Run a `db` command on behalf of a tab, keeping that tab's tracked SQLite connections in sync so
  // its connections panel reflects what it has open (mirrors Ink's `runDbInTab`). `delete` forgets
  // the connection; any opening command (create/query) records it once.
  private runDbInTab(label: string, command: string): string {
    const output = runDatabaseCommand(command);
    const parsed = parseDatabaseCommand(command);
    if (!('error' in parsed)) {
      if (parsed.action === 'delete') this.forgetDbConn(parsed.name);
      else if (parsed.action !== 'list' && isConnectionOpen(parsed.name)) {
        const current = this.tabDbConns.get(label) ?? [];
        if (!current.includes(parsed.name)) this.tabDbConns.set(label, [...current, parsed.name].toSorted((a, b) => a.localeCompare(b)));
      }
    }
    return output;
  }

  // Drop a database name from every tab's tracked connections (on `db delete`).
  private forgetDbConn(name: string): void {
    for (const [label, names] of this.tabDbConns) {
      if (names.includes(name)) this.tabDbConns.set(label, names.filter((n) => n !== name));
    }
  }

  // --- messaging -----------------------------------------------------------

  private runMsg(command: string, label: string): void {
    const parsed = parseMessageCommand(command);
    if ('error' in parsed) { this.append(label, { input: command, output: parsed.error }); return; }
    if (!this.bus.send({ from: label, to: parsed.to, kind: parsed.kind, text: parsed.text })) {
      this.append(label, { input: command, output: `No agent named "${parsed.to}".` });
      return;
    }
    // Show the sent message in the sender's transcript
    this.append(label, { input: command, output: `→ ${parsed.to} (${parsed.kind}): ${parsed.text}` });
  }

  private runBroadcast(command: string, label: string): void {
    const parsed = parseBroadcastCommand(command);
    if ('error' in parsed) { this.append(label, { input: command, output: parsed.error }); return; }
    const targets = parsed.targets === 'all'
      ? this.tabs.map((t) => t.label).filter((l) => l !== label)
      : parsed.targets;
    const missing: string[] = [];
    for (const to of targets) {
      if (!this.bus.send({ from: label, to, kind: parsed.kind, text: parsed.text })) missing.push(to);
    }
    if (missing.length > 0) this.append(label, { input: command, output: `No agent named: ${missing.join(', ')}.` });
  }

  // --- acp (autonomous agent tool loop) ------------------------------------

  private runAcp(command: string, label: string, onDone?: (output: string) => void): void {
    const prompt = command.replace(/^acp\b\s*/i, '').trim();
    if (!prompt) { this.append(label, { input: command, output: 'Usage: acp <prompt>.' }); return; }

    let session = this.acpSessions.get(label);
    if (!session) {
      const config = { model: 'google/gemini-3.1-flash-lite' };
      const slash = config.model.indexOf('/');
      const info: AcpInfo = slash === -1
        ? { model: config.model }
        : { provider: config.model.slice(0, slash), model: config.model.slice(slash + 1) };
      session = connectAcp({
        command: 'opencode', args: ['acp'],
        cwd: this.cwd.get(label) ?? process.cwd(),
        onError: (m) => this.append(label, { input: '', output: `ACP: ${m}` }),
        onConnect: () => { this.acpInfo.set(label, info); this.sinks.emitState(); },
        env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) },
      });
      this.acpSessions.set(label, session);
    }

    // Update the current turn's streaming entry (the last `running` one) with new text.
    const updateRunning = (output: string, running: boolean) => {
      const t = this.tabs.find((x) => x.label === label);
      if (t) {
        const log = [...t.log];
        const index = log.findLastIndex((e) => e.running);
        if (index !== -1) log[index] = { ...log[index], output, running };
        t.log = log;
        if (!running) this.persist(t);
      }
      if (!running) this.log(label, output); // log each finalized agent turn once
      this.sinks.emitState();
    };

    let lastAnswer = '';
    runAcpToolLoop(session, prompt, {
      primer: `${DB_PRIMER}\n\n${BROWSER_PRIMER}\n\nWrite your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks, etc.); the tab renders them as formatted Markdown.`,
      runCommand: (c) => (/^browser\b/i.test(c) ? this.browsers.run(label, c) : this.runDbInTab(label, c)),
      extractCommand: (t) => extractBrowserCommand(t) ?? extractDatabaseCommand(t) ?? null,
    }, {
      // The reply entry is flagged `markdown` so the renderer interprets it as Markdown; the raw
      // text is kept verbatim (no terminal-style table/word-wrap rewriting).
      startTurn: (isFirst) => { this.busy.add(label); this.append(label, { input: isFirst ? prompt : '', output: '', running: true, markdown: true }); },
      chunk: (buffer) => updateRunning(buffer, true),
      endTurn: (final) => { updateRunning(final, false); lastAnswer = final; },
      ranCommand: (c, result) => this.append(label, { input: c, output: result, acp: true }),
      finished: (reason, maxSteps) => {
        this.busy.delete(label);
        if (reason === 'capped') this.append(label, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
        this.sinks.emitState();
        onDone?.(lastAnswer);
      },
      error: (m) => { updateRunning(`ACP error: ${m}`, false); this.busy.delete(label); onDone?.(`ACP error: ${m}`); },
    });
  }

  // --- browser (per-tab Playwright) ----------------------------------------

  // Browser actions are async (navigation, eval, screenshots): show a running entry, then fill
  // it with the result when the Playwright call resolves.
  private runBrowser(command: string, label: string, onDone?: (output: string) => void): void {
    this.startRunning(label, command);
    void this.browsers.run(label, command)
      .then((out) => { this.finishRunning(label, out); onDone?.(out); })
      .catch((error) => { const message = `Browser error: ${error instanceof Error ? error.message : String(error)}`; this.finishRunning(label, message); onDone?.(message); });
  }

  // --- open (file viewers) -------------------------------------------------

  // Dispatch `open [external] <path>` to the opener registered for the file's type. A wildcard path is
  // expanded by the shell into the matching files; `open` then acts on each in turn, capped at
  // OPEN_MAX_FILES. The dispatcher resolves files and surfaces parse/lookup errors; the opener owns
  // the rest (launch an external viewer, or mount an in-app view). Adding a file type means adding an
  // opener — this never changes.
  private runOpen(command: string, label: string): void {
    const parsed = parseOpen(command);
    if ('error' in parsed) { this.append(label, { input: command, output: parsed.error }); return; }
    const cwd = this.cwd.get(label) ?? process.cwd();
    const context: OpenContext = {
      note: (text) => this.append(label, { input: command, output: text }),
      openImageTab: (image) => this.openImageTab(image),
      registerFile: (absPath) => this.registerFile(absPath),
      openExternally: (absPath) => didOsOpen(absPath),
    };

    if (isGlobPattern(parsed.path)) {
      const matches = this.expandGlob(parsed.path, cwd);
      if (matches.length === 0) { this.append(label, { input: command, output: `open: ${parsed.path}: no matching files` }); return; }
      const files = matches.slice(0, Controller.OPEN_MAX_FILES);
      if (matches.length > files.length) {
        this.append(label, { input: command, output: `Opening the first ${files.length} of ${matches.length} matching files.` });
      }
      for (const file of files) this.openOne(command, label, file, parsed.external, context);
      return;
    }

    const file = path.isAbsolute(parsed.path) ? parsed.path : path.resolve(cwd, parsed.path);
    this.openOne(command, label, file, parsed.external, context);
  }

  // Act on a single resolved file: report a missing file or an unsupported type, else hand it to the
  // matching opener's external/inline surface. Shared by the single-path and wildcard branches.
  private openOne(command: string, label: string, file: string, external: boolean, context: OpenContext): void {
    if (!existsSync(file)) { this.append(label, { input: command, output: `open: ${file}: no such file` }); return; }
    const opener = openerForExtension(path.extname(file));
    if (!opener) { this.append(label, { input: command, output: `No opener for "${path.extname(file) || '(none)'}" files.` }); return; }
    void (external ? opener.external(file, context) : opener.inline(file, context));
  }

  // Expand a shell wildcard pattern into its matching regular files (absolute, deduped, sorted), run
  // through the tab's shell so globbing matches what the user would get on the command line. A
  // pattern that matches nothing yields an empty list.
  private expandGlob(pattern: string, cwd: string): string[] {
    let stdout: string;
    try {
      const res = spawnSync(SHELL_NAME, ['-c', String.raw`for f in ${pattern}; do printf '%s\n' "$f"; done`], {
        cwd, encoding: 'utf8', timeout: 5000,
      });
      stdout = res.stdout ?? '';
    } catch { return []; }
    const files = stdout.split('\n').map((s) => s.trim()).filter(Boolean)
      .map((p) => (path.isAbsolute(p) ? p : path.resolve(cwd, p)))
      .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } });
    return [...new Set(files)].toSorted((a, b) => a.localeCompare(b));
  }

  // Register a local file for serving to the web client; returns the app-relative ref (`/open/<id>`).
  private registerFile(absPath: string): string {
    const id = String(++this.openFileCounter);
    this.openFiles.set(id, absPath);
    return `/open/${id}`;
  }

  // The absolute path behind an `/open/<id>` ref, or undefined when not registered (drives the route).
  openFilePath(id: string): string | undefined {
    return this.openFiles.get(id);
  }

  // Create and focus an image view tab adjacent to the active tab's group (mirrors `newAgent`'s
  // placement and color choice). Image tabs are in-memory and never persisted — no `persist` call.
  private openImageTab(image: ImageView): void {
    const creator = this.cur();
    const label = this.uniqueImageLabel();
    const dotColor = distinctColor(this.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const tab = makeImageTab(label, dotColor, this.tabs.length + 1, group, groupColor, image);
    this.tabs = insertTabInGroup(this.tabs, tab);
    this.activeTab = this.tabs.findIndex((t) => t.label === label);
    this.sinks.emitState();
  }

  // A unique internal label for a new image tab: `image`, then `image-2`, `image-3`, … The displayed
  // name stays `image` (the tab's `title`); only the internal key is disambiguated so several coexist.
  private uniqueImageLabel(): string {
    const used = new Set(this.tabs.map((t) => t.label));
    if (!used.has('image')) return 'image';
    let n = 2;
    while (used.has(`image-${n}`)) n++;
    return `image-${n}`;
  }

  // --- schedule ------------------------------------------------------------

  private runSchedule(command: string, label: string): void {
    const parsed = parseScheduleCommand(command.replace(/^schedule\b\s*/i, ''), new Date());
    const out = (text: string) => this.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    const current = this.schedules.get(label) ?? [];
    if (parsed.action === 'list') { out(formatSchedule(current)); return; }
    let next: ScheduleEntry[];
    let message: string;
    if (parsed.action === 'add') {
      if (current.some((e) => e.id === parsed.name)) { out(`A scheduled command named "${parsed.name}" already exists.`); return; }
      const entry: ScheduleEntry = { ...parsed.entry, id: parsed.name };
      next = [...current, entry];
      message = `Scheduled ${entry.id}: ${entry.spec} — ${entry.command}`;
    } else if (parsed.action === 'cancel') {
      next = current.filter((e) => e.id !== parsed.id);
      if (next.length === current.length) { out(`No scheduled command "${parsed.id}".`); return; }
      message = `Cancelled ${parsed.id}.`;
    } else {
      if (current.length === 0) { out('No scheduled commands.'); return; }
      next = [];
      message = `Cleared ${current.length} scheduled command${current.length === 1 ? '' : 's'}.`;
    }
    this.schedules.set(label, next);
    const tab = this.tabs.find((t) => t.label === label);
    if (tab) this.persist(tab);
    out(message);
  }

  private tick(): void {
    const now = Date.now();
    for (const tab of this.tabs) {
      const sched = this.schedules.get(tab.label);
      if (!sched || sched.length === 0) continue;
      let isChanged = false;
      const remaining: ScheduleEntry[] = [];
      for (const e of sched) {
        if (e.nextRun > now) { remaining.push(e); continue; }
        isChanged = true;
        this.dispatchTo(tab.label, `${e.command} ## scheduled ##`);
        if (e.recurring) remaining.push({ ...e, nextRun: computeNextRun(e, new Date()) });
      }
      if (isChanged) { this.schedules.set(tab.label, remaining); this.persist(tab); }
    }
  }

  // --- profile -------------------------------------------------------------

  private runProfile(command: string, label: string): void {
    const parsed = parseProfileCommand(command);
    const out = (text: string) => this.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') { const names = listProfiles(); out(names.length > 0 ? names.join('\n') : 'No profiles.'); return; }
    if (!profileExists(parsed.name)) { out(`No profile named "${parsed.name}".`); return; }
    const agents = loadProfileAgents(parsed.name);
    if (agents.length === 0) { out(`Profile "${parsed.name}" has no agents.`); return; }

    // A launched profile forms one group shared by all its agents. Honor a group number authored
    // on the profile's agent files; otherwise mint the next free group number.
    const authored = agents.map((a) => a.group).find((g): g is number => typeof g === 'number');
    const group = authored ?? Math.max(0, ...this.tabs.map((t) => t.group)) + 1;
    const open = new Set(this.tabs.map((t) => t.label.toLowerCase()));
    const used = new Set(this.tabs.map((t) => t.dotColor));
    const opened: string[] = [];
    const skipped: string[] = [];
    let groupColor: string | undefined;
    const firstNew = this.tabs.length;
    for (const state of agents) {
      if (open.has(state.name.toLowerCase())) { skipped.push(state.name); continue; }
      const dotColor = distinctColor(used, state.dotColor);
      used.add(dotColor);
      groupColor ??= dotColor;
      const tab = makeTab(state.name, dotColor, this.tabs.length + 1, state.cmdHistory ?? [],
        this.capLog((state.log) ?? []), state.workspaceDir, group, groupColor);
      tab.toolStepsExpanded = false;
      this.tabs = [...this.tabs, tab];
      if (state.cwd) this.cwd.set(state.name, state.cwd);
      if (state.schedule) this.schedules.set(state.name, state.schedule);
      if (state.context) this.context.set(state.name, state.context);
      this.persist(tab);
      open.add(state.name.toLowerCase());
      opened.push(state.name);
    }
    if (opened.length > 0) this.activeTab = firstNew;
    const parts: string[] = [];
    if (opened.length > 0) parts.push(`Launched profile "${parsed.name}": ${opened.join(', ')}.`);
    if (skipped.length > 0) parts.push(`Already open: ${skipped.join(', ')}.`);
    out(parts.length > 0 ? parts.join(' ') : `Profile "${parsed.name}" has no agents to open.`);
  }

  // --- connection ----------------------------------------------------------

  private runConnection(command: string, label: string): void {
    const parsed = parseConnectionCommand(command);
    const out = (text: string) => this.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const lines: string[] = [];
      if (this.shells.has(label)) lines.push(`shell:${SHELL_NAME}`);
      if (this.acpSessions.has(label)) lines.push('acp:opencode');
      const b = this.browsers.info(label);
      if (b) for (const id of b.ids) lines.push(`browser:${id}`);
      for (const [, e] of this.ptys) if (e.tabLabel === label) lines.push(`terminal:${e.session.program}`);
      for (const n of listOpenConnections()) lines.push(`sqlite:${n}`);
      out(lines.length > 0 ? lines.join('\n') : 'No open connections.');
      return;
    }
    // Closing a browser window is async (Playwright); show a running entry and finalize it.
    if (parsed.kind === 'browser') {
      this.startRunning(label, command);
      void this.browsers.run(label, `browser window close ${parsed.id}`).then((o) => this.finishRunning(label, o));
      return;
    }
    switch (parsed.kind) {
    case 'sqlite': {
      out(closeConnection(parsed.id) ? `Closed connection sqlite:${parsed.id}.` : `No open connection sqlite:${parsed.id}.`);
    
    break;
    }
    case 'shell': {
      if (this.shells.has(label)) { this.shells.get(label)?.kill(); this.shells.delete(label); out(`Closed connection shell:${SHELL_NAME}.`); }
      else out(`No open connection shell:${parsed.id}.`);
    
    break;
    }
    case 'acp': {
      if (this.acpSessions.has(label)) { this.acpSessions.get(label)?.kill(); this.acpSessions.delete(label); this.acpInfo.delete(label); this.sinks.emitState(); out('Closed connection acp:opencode.'); }
      else out('No open connection acp:opencode.');
    
    break;
    }
    default: {
      out(`Closing ${parsed.kind} connections is not yet available in the web UI.`);
    }
    }
  }

  // --- scraped shell -------------------------------------------------------

  private getShell(label: string): ChildProcess {
    let shell = this.shells.get(label);
    if (!shell || !shell.stdin?.writable) {
      shell = spawnShell(0, { JANUS_AGENT_NAME: label });
      this.shells.set(label, shell);
      // Start the shell in the tab's working directory — the workspace clone for a workspaced
      // agent, or the saved cwd for a `--relaunch`'d tab (mirrors the Ink useShellManager).
      const cwd = this.cwd.get(label);
      if (cwd) shell.stdin!.write(`cd "${cwd}"\n`);
    }
    return shell;
  }

  // Run a shell command in a tab's persistent shell. `display` streams it into the transcript;
  // `onComplete` receives the final captured output regardless.
  private runShell(label: string, command: string, options: { display?: boolean; onComplete?: (out: string) => void } = {}): void {
    const isDisplay = options.display ?? true;
    const index = Math.max(0, this.tabs.findIndex((t) => t.label === label));
    const shell = this.getShell(label);
    const cwd = this.cwd.get(label) ?? process.cwd();
    const tab = this.tabs.find((t) => t.label === label);
    if (!tab) { options.onComplete?.(''); return; }
    if (isDisplay) { tab.log = this.capLog([...tab.log, { input: command, output: '', running: true, cwd }]); this.log(label, command); }
    this.busy.add(label);
    this.sinks.emitState();
    const update = (output: string, running: boolean) => {
      if (isDisplay) {
        const t = this.tabs.find((x) => x.label === label);
        if (t) {
          const log = [...t.log];
          const index_ = log.findLastIndex((e) => e.input === command && e.running);
          if (index_ !== -1) log[index_] = { ...log[index_], output, running };
          t.log = log;
        }
      }
      if (!running) { this.busy.delete(label); if (isDisplay && tab) this.persist(tab); }
      this.sinks.emitState();
    };
    executeShellCommand(shell, command, index,
      (buffer) => update(buffer, true),
      (result) => {
        update(result, false);
        if (isDisplay) this.log(label, result); // log the final shell output (capture runs aren't logged)
        options.onComplete?.(result);
        queryShellPwd(shell, index, (pwd) => { if (!pwd) {
        	return;
        }

        this.cwd.set(label, pwd); this.sinks.emitState(); });
      },
    );
  }

  // Run text in a tab dispatching it as if the user typed it (full command routing, acp, browser,
  // etc.), showing output in the transcript and calling back with the captured result.
  private runCapture(label: string, text: string, callback: (out: string) => void): void {
    // Shell commands (explicit `shell` keyword)
    if (/^shell\b/i.test(text)) {
      const command = text.replace(/^shell\b\s*/i, '');
      if (command && isInteractive(command)) { callback(`Cannot run interactive command remotely: ${command}`); return; }
      this.runShell(label, command, { display: true, onComplete: callback });
      return;
    }

    const trimmed = text.replace(/^\//, '');
    const index = this.tabs.findIndex((t) => t.label === label);
    if (index === -1) { callback('Tab not found'); return; }

    // App commands — check against the command registry
    for (const c of commands) {
      if (c.match(trimmed)) {
        // Async commands that need completion callbacks
        if (c.name === 'acp') { this.runAcp(trimmed, label, callback); return; }
        if (c.name === 'browser') { this.runBrowser(trimmed, label, callback); return; }
        // Sync commands: dispatch and capture output from the last log entry
        const tab = this.tabs.find((t) => t.label === label);
        const before = tab?.log.length ?? 0;
        this.runApp(c.name, trimmed, label, index);
        const after = this.tabs.find((t) => t.label === label)?.log.length ?? 0;
        callback(after > before ? this.tabs.find((t) => t.label === label)!.log[after - 1].output : '');
        return;
      }
    }

    // Output commands (help) — the only real output command is `help`; everything else
    // `getOutput` returns is an "Unknown command" message that needs probabilistic routing.
    const output = getOutput(trimmed);
    if (output !== null && !output.startsWith('Unknown command:')) {
      this.append(label, { input: text, output, markdown: trimmed === 'help' });
      callback(output);
      return;
    }

    // Probabilistic routing for unprefixed commands (bare `ls`, `df`, etc.)
    const openDbs = this.openDbsFor(label);
    const decision = analyzeCommand(trimmed, { openDbs });
    if (decision.kind === 'route' && (decision.route !== 'db' || openDbs.length === 1)) {
      const choice: RouteChoice = decision.route === 'db'
        ? { label: '', route: 'db', dbName: openDbs[0] }
        : { label: '', route: decision.route };
      this.runCapture(label, toPrefixedCommand(trimmed, choice), callback);
      return;
    }
    callback(output ?? `Unknown command: "${trimmed}".`);
  }

  // --- inline terminal cards (PTY) -----------------------------------------

  private openPty(label: string, command: string, program: string, harness?: string): void {
    const cwd = this.cwd.get(label) ?? process.cwd();
    const session = spawnPty(program, command, cwd, {
      onData: (id, data) => this.sinks.sendPty(id, data),
      onExit: (id, exitCode) => this.onPtyExit(id, exitCode),
    }, this.cols, this.rows);
    this.ptys.set(session.id, { session, tabLabel: label });
    if (harness) this.harnessOf.set(label, harness);
    this.append(label, { input: '', output: '', terminal: { ptyId: session.id, program, status: 'running' } });
  }

  private onPtyExit(id: string, exitCode: number): void {
    const entry = this.ptys.get(id);
    this.ptys.delete(id);
    if (entry) this.harnessOf.delete(entry.tabLabel);
    for (const tab of this.tabs) {
      const index = tab.log.findIndex((e) => e.terminal?.ptyId === id);
      if (index !== -1) {
        const log = [...tab.log];
        log[index] = { ...log[index], terminal: { ...log[index].terminal!, status: 'exited', exitCode } };
        tab.log = log;
        this.persist(tab);
      }
    }
    this.sinks.sendPtyExit(id, exitCode);
    this.sinks.emitState();
  }

  ptyInput(id: string, data: string): void { this.ptys.get(id)?.session.write(data); }
  ptyResize(id: string, cols: number, rows: number): void { this.ptys.get(id)?.session.resize(cols, rows); }
  ptyKill(id: string): void { this.ptys.get(id)?.session.kill(); }
  resize(cols: number, rows: number): void { this.cols = cols; this.rows = rows; }

  // --- tab management ------------------------------------------------------

  private newAgent(command: string): void {
    const parsed = parseAgentCommand(command);
    const existing = this.tabs.map((t) => t.label);
    // A new agent joins the group of the agent that created it (the active tab), inheriting that
    // group's number and fixed bar color. A bare `agent` draws a random unused name from the pool.
    const creator = this.cur();
    const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existing);
    const out = (text: string) => this.append(creator.label, { input: command, output: text });
    if (resolved === null) { out('All agent names are in use.'); return; }
    if (existing.some((l) => l.toLowerCase() === resolved.toLowerCase())) { out(`Agent "${resolved}" is already active.`); return; }

    // `--workspace` gives the agent a `git clone --shared` of the repo detected from cwd, and its
    // shell starts there. Bail with a message if there's no repo or the clone fails.
    let workspaceDir: string | undefined;
    if (parsed.workspace) {
      const root = findRepoRoot(process.cwd());
      if (!root) { out('No git repository found. Cannot create workspace.'); return; }
      try { workspaceDir = createWorkspace(resolved, root); this.workspaces.add(workspaceDir); }
      catch (error) { out(`Failed to create workspace: ${error instanceof Error ? error.message : String(error)}`); return; }
    }

    const dotColor = distinctColor(this.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const tab = makeTab(resolved, dotColor, this.tabs.length + 1, [], [], workspaceDir, group, groupColor);
    tab.toolStepsExpanded = false;
    // Insert next to the creator's group so the group stays one contiguous run; keep focus on the
    // creator (the insertion can shift indices, so re-find it by label).
    this.tabs = insertTabInGroup(this.tabs, tab);
    this.cwd.set(resolved, workspaceDir ?? process.cwd());
    this.activeTab = this.tabs.findIndex((t) => t.label === creator.label);
    this.persist(tab);
    out(`Agent "${resolved}" ready.${workspaceDir ? ` (workspace: ${this.shorten(workspaceDir)})` : ''}`);
  }

  setActiveTab(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    this.activeTab = index;
    this.sinks.emitState();
  }

  moveTab(dir: -1 | 1): void {
    this.setActiveTab((this.activeTab + dir + this.tabs.length) % this.tabs.length);
  }

  // Reorder the active tab within its group (mirrors the Ink Ctrl+Arrow binding). swapTabsLeft/
  // Right enforce the group boundary (returning the same array when the move isn't allowed) and
  // renumber the tabs; the active tab follows the one it moved.
  reorderTab(dir: -1 | 1): void {
    const from = this.activeTab;
    const next = dir < 0 ? swapTabsLeft(this.tabs, from) : swapTabsRight(this.tabs, from);
    if (next === this.tabs) return; // not movable (group boundary / edge)
    this.tabs = next;
    const to = dir < 0 ? Math.max(0, from - 1) : Math.min(from + 1, this.tabs.length - 1);
    this.activeTab = to;
    // Persist the two swapped tabs so their renumbered positions survive `--relaunch`.
    this.persist(this.tabs[from]);
    this.persist(this.tabs[to]);
    this.sinks.emitState();
  }

  closeTab(index: number): void {
    const tab = this.tabs[index];
    if (!tab) return;
    // Tear down everything tab-scoped (SQLite connections are global and left open).
    // An image tab owns no shell/acp/browser/workspace, so those steps below are no-ops for it; just
    // drop its served file from the allow-list so the `/open/<id>` ref stops resolving.
    if (tab.image) { const id = tab.image.url.replace(/^\/open\//, ''); this.openFiles.delete(id); }
    if (tab.workspaceDir) { removeWorkspace(tab.workspaceDir); this.workspaces.delete(tab.workspaceDir); }
    this.shells.get(tab.label)?.kill();
    this.shells.delete(tab.label);
    this.acpSessions.get(tab.label)?.kill();
    this.acpSessions.delete(tab.label);
    this.acpInfo.delete(tab.label);
    this.browsers.closeTab(tab.label);
    for (const [id, e] of this.ptys) if (e.tabLabel === tab.label) { e.session.kill(); this.ptys.delete(id); }
    this.harnessOf.delete(tab.label);
    this.schedules.delete(tab.label);
    this.tabDbConns.delete(tab.label);
    this.context.delete(tab.label);
    // Closing the last tab resets to a fresh `janus` tab, just like launch; the global SQLite
    // connections are closed too (mirrors the Ink last-tab cleanup), since no tab references them.
    if (this.tabs.length <= 1) {
      closeAllConnections();
      this.tabDbConns.clear();
      this.tabs = [this.makeRootTab()];
      this.cwd.set('janus', process.cwd());
      this.activeTab = 0;
      this.sinks.emitState();
      return;
    }
    this.tabs = this.tabs.filter((_, index_) => index_ !== index).map((t, index_) => ({ ...t, number: index_ + 1 }));
    this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
    this.sinks.emitState();
  }

  toggleCollapse(): void {
    const tab = this.cur();
    tab.toolStepsExpanded = !tab.toolStepsExpanded;
    this.sinks.emitState();
  }

  // Tab-completion for the command line (reuses the shared `completeCommandLine`): filesystem
  // paths against the active tab's cwd, `msg`/`broadcast` agent names, `connection close` targets,
  // and `browser` subcommands / window ids.
  complete(text: string, cursor: number): CompletionResult {
    const tab = this.cur();
    const cwd = this.cwd.get(tab.label) ?? process.cwd();
    const agents = this.tabs.map((t) => t.label);
    return completeCommandLine(text, cursor, cwd, agents, this.completionConnections(tab.label));
  }

  // Canonical connection strings for `connection close` completion (shell/acp/browser/sqlite).
  private completionConnections(label: string): string[] {
    const out: string[] = [];
    if (this.shells.has(label)) out.push(`shell:${SHELL_NAME}`);
    if (this.acpSessions.has(label)) out.push('acp:opencode');
    const b = this.browsers.info(label);
    if (b) for (const id of b.ids) out.push(`browser:${id}`);
    for (const n of listOpenConnections()) out.push(`sqlite:${n}`);
    return out;
  }

  shutdown(): void {
    clearInterval(this.timer);
    for (const [, shell] of this.shells) shell.kill();
    for (const [, session] of this.acpSessions) session.kill();
    for (const [, e] of this.ptys) e.session.kill();
    this.browsers.closeAll();
    closeAllConnections(); // SQLite connections are global; close them all at app exit
    this.tabDbConns.clear();
    for (const dir of this.workspaces) removeWorkspace(dir);
    this.workspaces.clear();
  }
}
