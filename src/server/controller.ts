import type { ChildProcess } from 'node:child_process';
import type { Tab, LogEntry, ScheduleEntry, AcpSession, AcpInfo } from '../types.js';
import {
  makeTab, distinctColor, insertTabInGroup, flattenBuffer, stripComments,
  swapTabsLeft, swapTabsRight, formatAgentOutput,
} from '../tab.js';
import { resolveCommand } from '../resolve.js';
import { isInteractive } from '../interactive.js';
import { parseHarnessCommand, HARNESS_COMMANDS } from '../harness.js';
import { parseAgentCommand, resolveAgentName, getOutput } from '../commands.js';
import { runDbCommand, DB_PRIMER, extractDbCommand } from '../db.js';
import { connectAcp } from '../acp.js';
import { runAcpToolLoop } from '../acp-loop.js';
import { analyzeCommand, toPrefixedCommand } from '../recognizers/index.js';
import { spawnShell, executeShellCmd, queryShellPwd } from '../shell.js';
import { spawnPty, type PtySession } from './pty.js';
import { saveAgentState, loadAgentState, listAgentStates } from '../agent-state.js';
import { homedir } from 'node:os';
import { parseScheduleCommand, formatSchedule, computeNextRun, fmtNextRun } from '../schedule.js';
import { parseProfileCommand, loadProfileAgents, listProfiles, profileExists } from '../profiles.js';
import { parseConnectionCommand, closeConnection, listOpenConnections } from '../connections.js';
import { parseMsgCommand, parseBroadcastCommand } from '../messaging.js';
import { extractBrowserCommand, BROWSER_PRIMER } from '../browser-command.js';
import { MessageBus } from './messaging.js';
import { BrowserManager } from './browser-tab.js';
import { formatState } from './state-format.js';
import type { TabView, ConnectionView, ScheduleView } from './protocol.js';

// Built-ins not yet ported to the web UI; recognized so they give an honest notice.
const UNPORTED = new Set(['hist', 'quit']);
const SHELL_NAME = (process.env.SHELL || 'bash').split('/').pop() || 'bash';

type Sinks = {
  emitState: () => void;
  sendPty: (id: string, data: string) => void;
  sendPtyExit: (id: string, exitCode: number) => void;
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
  private cols = 80;
  private rows = 24;
  private timer: ReturnType<typeof setInterval>;
  private bus: MessageBus;
  private browsers = new BrowserManager();

  constructor(private sinks: Sinks) {
    const tab = makeTab('janus', distinctColor([]));
    tab.toolStepsExpanded = false;
    this.tabs = [tab];
    this.cwd.set('janus', process.cwd());
    this.bus = new MessageBus({
      hasAgent: (l) => this.tabs.some((t) => t.label === l),
      agentColor: (l) => this.tabs.find((t) => t.label === l)?.dotColor ?? '#e4e5e7',
      isInteractive,
      appendLog: (l, entry) => this.append(l, entry),
      runShell: (l, cmd, done) => this.runShell(l, cmd, { onComplete: done }),
      runCapture: (l, text, cb) => this.runCapture(l, text, cb),
    });
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
  }

  // Restore tabs from persisted agent state (for `--relaunch`). Called before any client connects.
  rehydrate(): void {
    const states = listAgentStates().sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
    if (!states.length) return;
    this.tabs = states.map((s, i) => {
      const tab = makeTab(s.name, s.dotColor || distinctColor([]), i + 1, s.cmdHistory ?? [],
        (s.log as LogEntry[] | undefined) ?? [], s.workspaceDir, s.group ?? 1, s.groupColor || s.dotColor || '#5b9cff');
      tab.toolStepsExpanded = false;
      return tab;
    });
    for (const s of states) {
      if (s.cwd) this.cwd.set(s.name, s.cwd);
      if (s.schedule) this.schedules.set(s.name, s.schedule);
    }
    this.activeTab = 0;
  }

  view(): TabView[] {
    return this.tabs.map((t) => ({
      label: t.label, number: t.number, dotColor: t.dotColor, group: t.group, groupColor: t.groupColor,
      busy: this.busy.has(t.label), cwd: this.cwd.get(t.label) ?? process.cwd(),
      harness: this.harnessOf.get(t.label), acp: this.acpLabel(t.label),
      connections: this.connectionsFor(t.label), schedule: this.scheduleFor(t.label),
      bufferLines: flattenBuffer(t.log, !t.toolStepsExpanded),
      cmdHistory: t.cmdHistory, toolStepsExpanded: !!t.toolStepsExpanded,
    }));
  }

  private acpLabel(label: string): string | undefined {
    const info = this.acpInfo.get(label);
    if (!info) return undefined;
    return info.provider ? `${info.provider}/${info.model ?? ''}` : info.model;
  }

  // Abbreviate a cwd to `~` form for the connections panel.
  private shortCwd(p: string): string {
    const home = homedir();
    return p === home ? '~' : p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
  }

  // The active connections for a tab's floating "connections" panel: its shell + cwd, a
  // connected ACP agent, any inline terminal cards, and every open SQLite database.
  private connectionsFor(label: string): ConnectionView[] {
    const rows: ConnectionView[] = [];
    if (this.shells.has(label)) {
      rows.push({ text: `${SHELL_NAME}:${this.shortCwd(this.cwd.get(label) ?? process.cwd())}`, kind: 'shell' });
    }
    const acp = this.acpLabel(label);
    if (acp) rows.push({ text: `acp:${acp}`, kind: 'acp' });
    const b = this.browsers.info(label);
    if (b) for (const id of b.ids) rows.push({ text: `browser:${id} (${b.mode})`, kind: 'browser' });
    for (const [, e] of this.ptys) if (e.tabLabel === label) rows.push({ text: `terminal:${e.session.program}`, kind: 'terminal' });
    for (const n of listOpenConnections()) rows.push({ text: `sqlite:${n}`, kind: 'sqlite' });
    return rows;
  }

  private scheduleFor(label: string): ScheduleView[] {
    return (this.schedules.get(label) ?? []).map((e) => ({
      id: e.id, spec: e.spec, next: fmtNextRun(e.nextRun), recurring: e.recurring,
    }));
  }

  private cur(): Tab { return this.tabs[this.activeTab] ?? this.tabs[0]; }

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
      const i = log.findLastIndex((e) => e.running);
      if (i >= 0) log[i] = { ...log[i], output, running: false };
      t.log = log;
      this.busy.delete(label);
      this.persist(t);
    }
    this.sinks.emitState();
  }

  private append(label: string, entry: LogEntry): void {
    const tab = this.tabs.find((t) => t.label === label);
    if (!tab) return;
    tab.log = [...tab.log, entry];
    tab.scrollOffset = 0;
    this.persist(tab);
    this.sinks.emitState();
  }

  private persist(tab: Tab): void {
    try {
      saveAgentState({
        name: tab.label, dotColor: tab.dotColor, active: this.busy.has(tab.label),
        number: tab.number, group: tab.group, groupColor: tab.groupColor,
        cmdHistory: tab.cmdHistory, log: tab.log, cwd: this.cwd.get(tab.label),
        schedule: this.schedules.get(tab.label),
      });
    } catch { /* ignore */ }
  }

  // --- command dispatch ----------------------------------------------------

  dispatch(text: string): void {
    const trimmed = stripComments(text);
    const tab = this.cur();
    if (trimmed && tab.cmdHistory[tab.cmdHistory.length - 1] !== trimmed) {
      tab.cmdHistory = [...tab.cmdHistory, trimmed].slice(-100);
    }
    tab.cmdHistoryIdx = -1;
    this.run(trimmed, tab.label, this.activeTab);
  }

  // Run a command in a specific tab (used by the scheduler) without touching the active tab.
  private dispatchTo(label: string, text: string): void {
    const index = this.tabs.findIndex((t) => t.label === label);
    if (index < 0) return;
    this.run(stripComments(text), label, index);
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
      case 'empty': return;
      case 'shell':
        if (res.cmd && isInteractive(res.cmd)) this.openPty(label, res.cmd, res.cmd.split(/\s+/)[0]);
        else this.runShell(label, res.cmd);
        return;
      case 'output': this.append(label, { input, output: res.output }); return;
      case 'unknown': {
        const decision = analyzeCommand(res.cmd, { openDbs: [] });
        if (decision.kind === 'route' && decision.route !== 'db') {
          this.run(toPrefixedCommand(res.cmd, { label: '', route: decision.route }), label, index);
        } else {
          this.append(label, { input, output: 'Unrecognized command. Prefix with `shell `, `db `, or `acp ` to choose how to run it.' });
        }
        return;
      }
      case 'app': this.runApp(res.name, res.cmd, label, index); return;
    }
  }

  private runApp(name: string, cmd: string, label: string, index: number): void {
    switch (name) {
      case 'clear': {
        const tab = this.tabs.find((t) => t.label === label);
        if (tab) { tab.log = []; this.persist(tab); this.sinks.emitState(); }
        return;
      }
      case 'db': this.append(label, { input: cmd, output: runDbCommand(cmd) }); return;
      case 'agent': this.newAgent(cmd); return;
      case 'next': this.setActiveTab((this.activeTab + 1) % this.tabs.length); return;
      case 'close': this.closeTab(index); return;
      case 'msg': this.runMsg(cmd, label); return;
      case 'broadcast': this.runBroadcast(cmd, label); return;
      case 'acp': this.runAcp(cmd, label); return;
      case 'state': this.append(label, { input: cmd, output: formatState(label, loadAgentState(label)) }); return;
      case 'schedule': this.runSchedule(cmd, label); return;
      case 'profile': this.runProfile(cmd, label); return;
      case 'connection': this.runConnection(cmd, label); return;
      case 'browser': this.runBrowser(cmd, label); return;
    }
    if (UNPORTED.has(name)) {
      this.append(label, { input: cmd, output: `"${name}" is not yet available in the web UI (migration in progress).` });
      return;
    }
    this.append(label, { input: cmd, output: getOutput(cmd) ?? `"${name}" did nothing.` });
  }

  // --- messaging -----------------------------------------------------------

  private runMsg(cmd: string, label: string): void {
    const parsed = parseMsgCommand(cmd);
    if ('error' in parsed) { this.append(label, { input: cmd, output: parsed.error }); return; }
    if (!this.bus.send({ from: label, to: parsed.to, kind: parsed.kind, text: parsed.text })) {
      this.append(label, { input: cmd, output: `No agent named "${parsed.to}".` });
    }
  }

  private runBroadcast(cmd: string, label: string): void {
    const parsed = parseBroadcastCommand(cmd);
    if ('error' in parsed) { this.append(label, { input: cmd, output: parsed.error }); return; }
    const targets = parsed.targets === 'all'
      ? this.tabs.map((t) => t.label).filter((l) => l !== label)
      : parsed.targets;
    const missing: string[] = [];
    for (const to of targets) {
      if (!this.bus.send({ from: label, to, kind: parsed.kind, text: parsed.text })) missing.push(to);
    }
    if (missing.length) this.append(label, { input: cmd, output: `No agent named: ${missing.join(', ')}.` });
  }

  // --- acp (autonomous agent tool loop) ------------------------------------

  private runAcp(cmd: string, label: string): void {
    const prompt = cmd.replace(/^acp\b\s*/i, '').trim();
    if (!prompt) { this.append(label, { input: cmd, output: 'Usage: acp <prompt>.' }); return; }

    let session = this.acpSessions.get(label);
    if (!session) {
      const config = { model: 'google/gemini-3.1-flash-lite' };
      const slash = config.model.indexOf('/');
      const info: AcpInfo = slash >= 0
        ? { provider: config.model.slice(0, slash), model: config.model.slice(slash + 1) }
        : { model: config.model };
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
        const i = log.findLastIndex((e) => e.running);
        if (i >= 0) log[i] = { ...log[i], output, running };
        t.log = log;
        if (!running) this.persist(t);
      }
      this.sinks.emitState();
    };

    runAcpToolLoop(session, prompt, {
      primer: `${DB_PRIMER}\n\n${BROWSER_PRIMER}`,
      runCommand: (c) => (/^browser\b/i.test(c) ? this.browsers.run(label, c) : runDbCommand(c)),
      extractCommand: (t) => extractBrowserCommand(t) ?? extractDbCommand(t),
    }, {
      startTurn: (isFirst) => { this.busy.add(label); this.append(label, { input: isFirst ? prompt : '', output: '', running: true }); },
      chunk: (buf) => updateRunning(formatAgentOutput(buf, 100000), true),
      endTurn: (final) => updateRunning(formatAgentOutput(final, 100000), false),
      ranCommand: (c, result) => this.append(label, { input: c, output: result, acp: true }),
      finished: (reason, maxSteps) => {
        this.busy.delete(label);
        if (reason === 'capped') this.append(label, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
        this.sinks.emitState();
      },
      error: (m) => { updateRunning(`ACP error: ${m}`, false); this.busy.delete(label); },
    });
  }

  // --- browser (per-tab Playwright) ----------------------------------------

  // Browser actions are async (navigation, eval, screenshots): show a running entry, then fill
  // it with the result when the Playwright call resolves.
  private runBrowser(cmd: string, label: string): void {
    this.startRunning(label, cmd);
    void this.browsers.run(label, cmd)
      .then((out) => this.finishRunning(label, out))
      .catch((e) => this.finishRunning(label, `Browser error: ${e instanceof Error ? e.message : String(e)}`));
  }

  // --- schedule ------------------------------------------------------------

  private runSchedule(cmd: string, label: string): void {
    const parsed = parseScheduleCommand(cmd.replace(/^schedule\b\s*/i, ''), new Date());
    const out = (text: string) => this.append(label, { input: cmd, output: text });
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
      if (!current.length) { out('No scheduled commands.'); return; }
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
      if (!sched || !sched.length) continue;
      let changed = false;
      const remaining: ScheduleEntry[] = [];
      for (const e of sched) {
        if (e.nextRun > now) { remaining.push(e); continue; }
        changed = true;
        this.dispatchTo(tab.label, `${e.command} ## scheduled ##`);
        if (e.recurring) remaining.push({ ...e, nextRun: computeNextRun(e, new Date()) });
      }
      if (changed) { this.schedules.set(tab.label, remaining); this.persist(tab); }
    }
  }

  // --- profile -------------------------------------------------------------

  private runProfile(cmd: string, label: string): void {
    const parsed = parseProfileCommand(cmd);
    const out = (text: string) => this.append(label, { input: cmd, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') { const names = listProfiles(); out(names.length ? names.join('\n') : 'No profiles.'); return; }
    if (!profileExists(parsed.name)) { out(`No profile named "${parsed.name}".`); return; }
    const agents = loadProfileAgents(parsed.name);
    if (!agents.length) { out(`Profile "${parsed.name}" has no agents.`); return; }

    const group = Math.max(0, ...this.tabs.map((t) => t.group)) + 1;
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
        (state.log as LogEntry[] | undefined) ?? [], state.workspaceDir, group, groupColor);
      tab.toolStepsExpanded = false;
      this.tabs = [...this.tabs, tab];
      if (state.cwd) this.cwd.set(state.name, state.cwd);
      if (state.schedule) this.schedules.set(state.name, state.schedule);
      this.persist(tab);
      open.add(state.name.toLowerCase());
      opened.push(state.name);
    }
    if (opened.length) this.activeTab = firstNew;
    const parts: string[] = [];
    if (opened.length) parts.push(`Launched profile "${parsed.name}": ${opened.join(', ')}.`);
    if (skipped.length) parts.push(`Already open: ${skipped.join(', ')}.`);
    out(parts.length ? parts.join(' ') : `Profile "${parsed.name}" has no agents to open.`);
  }

  // --- connection ----------------------------------------------------------

  private runConnection(cmd: string, label: string): void {
    const parsed = parseConnectionCommand(cmd);
    const out = (text: string) => this.append(label, { input: cmd, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const lines: string[] = [];
      if (this.shells.has(label)) lines.push(`shell:${SHELL_NAME}`);
      if (this.acpSessions.has(label)) lines.push('acp:opencode');
      const b = this.browsers.info(label);
      if (b) for (const id of b.ids) lines.push(`browser:${id}`);
      for (const [, e] of this.ptys) if (e.tabLabel === label) lines.push(`terminal:${e.session.program}`);
      for (const n of listOpenConnections()) lines.push(`sqlite:${n}`);
      out(lines.length ? lines.join('\n') : 'No open connections.');
      return;
    }
    // Closing a browser window is async (Playwright); show a running entry and finalize it.
    if (parsed.kind === 'browser') {
      this.startRunning(label, cmd);
      void this.browsers.run(label, `browser window close ${parsed.id}`).then((o) => this.finishRunning(label, o));
      return;
    }
    if (parsed.kind === 'sqlite') {
      out(closeConnection(parsed.id) ? `Closed connection sqlite:${parsed.id}.` : `No open connection sqlite:${parsed.id}.`);
    } else if (parsed.kind === 'shell') {
      if (this.shells.has(label)) { this.shells.get(label)?.kill(); this.shells.delete(label); out(`Closed connection shell:${SHELL_NAME}.`); }
      else out(`No open connection shell:${parsed.id}.`);
    } else if (parsed.kind === 'acp') {
      if (this.acpSessions.has(label)) { this.acpSessions.get(label)?.kill(); this.acpSessions.delete(label); this.acpInfo.delete(label); this.sinks.emitState(); out('Closed connection acp:opencode.'); }
      else out('No open connection acp:opencode.');
    } else {
      out(`Closing ${parsed.kind} connections is not yet available in the web UI.`);
    }
  }

  // --- scraped shell -------------------------------------------------------

  private getShell(label: string): ChildProcess {
    let shell = this.shells.get(label);
    if (!shell || !shell.stdin?.writable) {
      shell = spawnShell(0);
      this.shells.set(label, shell);
    }
    return shell;
  }

  // Run a shell command in a tab's persistent shell. `display` streams it into the transcript;
  // `onComplete` receives the final captured output regardless.
  private runShell(label: string, cmd: string, opts: { display?: boolean; onComplete?: (out: string) => void } = {}): void {
    const display = opts.display ?? true;
    const index = Math.max(0, this.tabs.findIndex((t) => t.label === label));
    const shell = this.getShell(label);
    const cwd = this.cwd.get(label) ?? process.cwd();
    const tab = this.tabs.find((t) => t.label === label);
    if (!tab) { opts.onComplete?.(''); return; }
    if (display) tab.log = [...tab.log, { input: cmd, output: '', running: true, cwd }];
    this.busy.add(label);
    this.sinks.emitState();
    const update = (output: string, running: boolean) => {
      if (display) {
        const t = this.tabs.find((x) => x.label === label);
        if (t) {
          const log = [...t.log];
          const i = log.findLastIndex((e) => e.input === cmd && e.running);
          if (i >= 0) log[i] = { ...log[i], output, running };
          t.log = log;
        }
      }
      if (!running) { this.busy.delete(label); if (display && tab) this.persist(tab); }
      this.sinks.emitState();
    };
    executeShellCmd(shell, cmd, index,
      (buf) => update(buf, true),
      (result) => {
        update(result, false);
        opts.onComplete?.(result);
        queryShellPwd(shell, index, (pwd) => { if (pwd) { this.cwd.set(label, pwd); this.sinks.emitState(); } });
      },
    );
  }

  // Run text in a tab capturing output instead of displaying it (fulfils a `request`).
  private runCapture(label: string, text: string, cb: (out: string) => void): void {
    const res = resolveCommand(text);
    switch (res.kind) {
      case 'empty': cb(''); return;
      case 'shell':
        if (res.cmd && isInteractive(res.cmd)) { cb(`Cannot run interactive command remotely: ${res.cmd}`); return; }
        this.runShell(label, res.cmd, { display: false, onComplete: cb });
        return;
      case 'output':
      case 'unknown': cb(res.output); return;
      case 'app':
        cb(res.name === 'db' ? runDbCommand(res.cmd) : `Command not available remotely: ${res.cmd}`);
        return;
    }
  }

  // --- inline terminal cards (PTY) -----------------------------------------

  private openPty(label: string, cmd: string, program: string, harness?: string): void {
    const cwd = this.cwd.get(label) ?? process.cwd();
    const session = spawnPty(program, cmd, cwd, {
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
      const i = tab.log.findIndex((e) => e.terminal?.ptyId === id);
      if (i >= 0) {
        const log = [...tab.log];
        log[i] = { ...log[i], terminal: { ...log[i].terminal!, status: 'exited', exitCode } };
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

  private newAgent(cmd: string): void {
    const parsed = parseAgentCommand(cmd);
    const existing = this.tabs.map((t) => t.label);
    // A new agent joins the group of the agent that created it (the active tab), inheriting that
    // group's number and fixed bar color. A bare `agent` draws a random unused name from the pool.
    const creator = this.cur();
    const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existing);
    const out = (text: string) => this.append(creator.label, { input: cmd, output: text });
    if (resolved === null) { out('All agent names are in use.'); return; }
    if (existing.some((l) => l.toLowerCase() === resolved.toLowerCase())) { out(`Agent "${resolved}" is already active.`); return; }

    const dotColor = distinctColor(this.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const tab = makeTab(resolved, dotColor, this.tabs.length + 1, [], [], undefined, group, groupColor);
    tab.toolStepsExpanded = false;
    // Insert next to the creator's group so the group stays one contiguous run; keep focus on the
    // creator (the insertion can shift indices, so re-find it by label).
    this.tabs = insertTabInGroup(this.tabs, tab);
    this.cwd.set(resolved, process.cwd());
    this.activeTab = this.tabs.findIndex((t) => t.label === creator.label);
    this.persist(tab);
    const note = parsed.workspace ? ' (workspace clones are not yet available in the web UI)' : '';
    out(`Agent "${resolved}" ready.${note}`);
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
    if (this.tabs.length <= 1) return;
    const tab = this.tabs[index];
    this.shells.get(tab.label)?.kill();
    this.shells.delete(tab.label);
    this.acpSessions.get(tab.label)?.kill();
    this.acpSessions.delete(tab.label);
    this.acpInfo.delete(tab.label);
    this.browsers.closeTab(tab.label);
    for (const [id, e] of this.ptys) if (e.tabLabel === tab.label) { e.session.kill(); this.ptys.delete(id); }
    this.harnessOf.delete(tab.label);
    this.schedules.delete(tab.label);
    this.tabs = this.tabs.filter((_, i) => i !== index).map((t, i) => ({ ...t, number: i + 1 }));
    this.activeTab = Math.min(this.activeTab, this.tabs.length - 1);
    this.sinks.emitState();
  }

  toggleCollapse(): void {
    const tab = this.cur();
    tab.toolStepsExpanded = !tab.toolStepsExpanded;
    this.sinks.emitState();
  }

  shutdown(): void {
    clearInterval(this.timer);
    for (const [, shell] of this.shells) shell.kill();
    for (const [, session] of this.acpSessions) session.kill();
    for (const [, e] of this.ptys) e.session.kill();
    this.browsers.closeAll();
  }
}
