import type { ChildProcess } from 'node:child_process';
import type { Tab, LogEntry } from './tab.js';
import { stripComments, dotColors, makeTab, wordWrap, formatAgentOutput } from './tab.js';
import type { AgentState } from './agent-state.js';
import { saveAgentState, loadAgentState } from './agent-state.js';
import { resolveCommand } from './resolve.js';
import { resolveAgentName, parseAgentCommand } from './commands.js';
import { parseMsgCommand, parseBroadcastCommand, type MessageKind } from './messaging.js';
import { connectAcp, type AcpSession, type AcpInfo } from './acp.js';
import { runAcpToolLoop } from './acp-loop.js';
import { DB_PRIMER, extractDbCommand } from './db.js';
import { extractBrowserCommand, BROWSER_PRIMER } from './browser-command.js';
import {
  findRepoRoot, createWorkspace, removeWorkspace as removeWorkspaceDir,
} from './workspace.js';
import {
  closeConnection, closeAllConnections, listOpenConnections,
  parseConnectionCommand,
} from './connections.js';
import type { TabBrowser } from './browser.js';
import { isInteractive } from './interactive.js';
import { appendEntry, getTimeStr } from './logger.js';

export type CommandHandlerDeps = {
  tabs: Tab[];
  activeTab: number;
  updateCurrentTab: (updater: (tab: Tab) => Tab) => void;
  setTabs: (updater: (prev: Tab[]) => Tab[]) => void;
  setActiveTab: (fn: ((prev: number) => number) | number) => void;
  setInteractive: (v: { cmd: string; cwd?: string } | null) => void;
  setHistoryPickerOpen: (open: boolean) => void;
  setHistoryPickerIdx: (fn: ((prev: number) => number) | number) => void;
  setAgentStates: (updater: (prev: Record<string, AgentState>) => Record<string, AgentState>) => void;
  setAcpInfo: (updater: (prev: Record<number, AcpInfo>) => Record<number, AcpInfo>) => void;
  setShellActive: (updater: (prev: Record<number, boolean>) => Record<number, boolean>) => void;
  setTabDbConns: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  exit: () => void;
  shellsRef: { current: Map<number, ChildProcess> };
  acpRef: { current: Map<number, AcpSession> };
  browserRef: { current: Map<number, { browser: TabBrowser; current?: string; counter: number }> };
  cwdRef: { current: Record<string, string> };
  workspaceRef: { current: Set<string> };
  runShellInTab: (tabIndex: number, tabLabel: string, shellCmd: string, onComplete?: (output: string) => void, display?: boolean) => void;
  runBrowserInTab: (tabIndex: number, cmd: string) => Promise<string>;
  runDbInTab: (label: string, cmd: string) => string;
  finishRunning: (label: string, output: string) => void;
  closeBrowserWindow: (tabIndex: number, id: string) => Promise<string>;
  closeTabBrowser: (tabIndex: number) => void;
  forgetDbConn: (name: string) => void;
  appendLog: (label: string, entry: LogEntry) => void;
  initAgentState: (
    name: string, dotColor: string,
  ) => { cmdHistory?: string[]; log?: LogEntry[]; cwd?: string; workspaceDir?: string };
  sendMessage: (msg: { from: string; to: string; kind: MessageKind; text: string }) => boolean;
  saveTabLog: (label: string, log: LogEntry[]) => void;
  setAgentActive: (name: string, active: boolean) => void;
  shellName: string;
  columns: number;
  frequentHistory: string[];
};

export function createCommandHandler(deps: CommandHandlerDeps): (cmd: string) => void {
  const {
    tabs, activeTab, updateCurrentTab, setTabs, setActiveTab,
    setInteractive, setHistoryPickerOpen, setHistoryPickerIdx,
    setAgentStates, setAcpInfo, setShellActive, setTabDbConns,
    exit,
    shellsRef, acpRef, browserRef, cwdRef, workspaceRef,
    runShellInTab, runBrowserInTab, runDbInTab,
    finishRunning, closeBrowserWindow, closeTabBrowser,
    forgetDbConn, appendLog, initAgentState, sendMessage,
    saveTabLog, setAgentActive,
    shellName, columns, frequentHistory,
  } = deps;

  return (cmd: string) => {
    const trimmed = stripComments(cmd);
    const curTab = tabs[activeTab];
    const newHistory = curTab && curTab.cmdHistory[curTab.cmdHistory.length - 1] !== trimmed
      ? [...curTab.cmdHistory, trimmed].slice(-100)
      : curTab?.cmdHistory ?? [];

    updateCurrentTab((tab) => {
      if (tab.cmdHistory[tab.cmdHistory.length - 1] === trimmed) return { ...tab, cmdHistoryIdx: -1 };
      return { ...tab, cmdHistory: newHistory, cmdHistoryIdx: -1 };
    });

    if (curTab && newHistory !== curTab.cmdHistory) {
      setAgentStates((prev) => {
        const cur = prev[curTab.label];
        if (!cur) return prev;
        const updated = { ...cur, cmdHistory: newHistory };
        try { saveAgentState(updated); } catch { /* ignore */ }
        return { ...prev, [curTab.label]: updated };
      });
    }

    const tabIndex = activeTab;
    const tabLabel = tabs[tabIndex].label;
    const res = resolveCommand(trimmed);

    if (res.kind === 'empty') return;

    if (res.kind === 'shell') {
      if (res.cmd && isInteractive(res.cmd)) {
        setInteractive({ cmd: res.cmd, cwd: cwdRef.current[tabLabel] ?? process.cwd() });
        return;
      }
      runShellInTab(tabIndex, tabLabel, res.cmd);
      return;
    }

    if (res.kind === 'output') {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: trimmed, output: res.output }], scrollOffset: 0 }
      ));
      return;
    }

    const cliTrimmed = res.cmd;
    switch (res.name) {
      case 'agent': {
        const existingLabels = tabs.map((t) => t.label);
        const parsed = parseAgentCommand(cliTrimmed);
        const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existingLabels);
        if (resolved === null) {
          updateCurrentTab((tab) => (
            { ...tab, log: [...tab.log, { input: trimmed, output: 'All agent names are in use.' }], scrollOffset: 0 }
          ));
          return;
        }
        if (existingLabels.some((l) => l.toLowerCase() === resolved.toLowerCase())) {
          updateCurrentTab((tab) => (
            { ...tab, log: [...tab.log, { input: trimmed, output: `Agent "${resolved}" is already active.` }], scrollOffset: 0 }
          ));
          return;
        }
        let workspaceDir: string | undefined;
        if (parsed.workspace) {
          const repoRoot = findRepoRoot(process.cwd());
          if (!repoRoot) {
            updateCurrentTab((tab) => (
              { ...tab, log: [...tab.log, { input: trimmed, output: 'No git repository found. Cannot create workspace.' }], scrollOffset: 0 }
            ));
            return;
          }
          try {
            workspaceDir = createWorkspace(resolved, repoRoot);
          } catch (e) {
            updateCurrentTab((tab) => (
              { ...tab, log: [...tab.log, { input: trimmed, output: `Failed to create workspace: ${e instanceof Error ? e.message : String(e)}` }], scrollOffset: 0 }
            ));
            return;
          }
        }
        const newTabIndex = tabs.length;
        const dotColor = dotColors[newTabIndex % dotColors.length];
        const { cmdHistory, log } = initAgentState(resolved, dotColor);
        setTabs((prev) => [...prev, makeTab(resolved, dotColor, newTabIndex + 1, cmdHistory ?? [], log ?? [], workspaceDir)]);
        if (workspaceDir) {
          cwdRef.current[resolved] = workspaceDir;
          workspaceRef.current.add(workspaceDir);
          setAgentStates((prev) => {
            const cur = prev[resolved];
            if (!cur) return prev;
            const updated = { ...cur, workspaceDir };
            try { saveAgentState(updated); } catch { /* ignore */ }
            return { ...prev, [resolved]: updated };
          });
        }
        const suffix = workspaceDir ? ` (workspace: ${workspaceDir})` : '';
        updateCurrentTab((tab) => (
          { ...tab, log: [...tab.log, { input: trimmed, output: `Agent "${resolved}" ready.${suffix}` }], scrollOffset: 0 }
        ));
        return;
      }
      case 'next':
        setActiveTab((activeTab + 1) % tabs.length);
        return;
      case 'msg': {
        const fromLabel = tabs[activeTab].label;
        const parsed = parseMsgCommand(cliTrimmed);
        const result = 'error' in parsed
          ? parsed.error
          : parsed.to === fromLabel
            ? 'Cannot message yourself.'
            : !sendMessage({ from: fromLabel, to: parsed.to, kind: parsed.kind, text: parsed.text })
              ? `No agent named "${parsed.to}".`
              : `Sent ${parsed.kind} to ${parsed.to}.`;
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: result }], scrollOffset: 0 }));
        return;
      }
      case 'broadcast': {
        const fromLabel = tabs[activeTab].label;
        const parsed = parseBroadcastCommand(cliTrimmed);
        if ('error' in parsed) {
          updateCurrentTab((tab) => (
            { ...tab, log: [...tab.log, { input: trimmed, output: parsed.error }], scrollOffset: 0 }
          ));
          return;
        }
        const targets = (parsed.targets === 'all'
          ? tabs.map((t) => t.label)
          : parsed.targets
        ).filter((to) => to !== fromLabel);
        const sent: string[] = [];
        const missing: string[] = [];
        for (const to of targets) {
          if (sendMessage({ from: fromLabel, to, kind: parsed.kind, text: parsed.text })) sent.push(to);
          else missing.push(to);
        }
        const segments: string[] = [];
        if (sent.length) segments.push(`Sent ${parsed.kind} to ${sent.join(', ')}.`);
        if (missing.length) segments.push(`No agent named: ${missing.join(', ')}.`);
        if (!segments.length) segments.push('No other agents to broadcast to.');
        updateCurrentTab((tab) => (
          { ...tab, log: [...tab.log, { input: trimmed, output: segments.join(' ') }], scrollOffset: 0 }
        ));
        return;
      }
      case 'acp': {
        const prompt = cliTrimmed.replace(/^acp\b\s*/i, '').trim();
        if (!prompt) {
          updateCurrentTab((tab) => (
            { ...tab, log: [...tab.log, { input: trimmed, output: 'Usage: acp <prompt>.' }], scrollOffset: 0 }
          ));
          return;
        }
        let session = acpRef.current.get(tabIndex);
        if (!session) {
          const command = 'opencode';
          const args = ['acp'];
          const opencodeConfig = { model: 'opencode/deepseek-v4-flash-free' };
          const slash = opencodeConfig.model.indexOf('/');
          const acpLabel: AcpInfo = slash >= 0
            ? { provider: opencodeConfig.model.slice(0, slash), model: opencodeConfig.model.slice(slash + 1) }
            : { model: opencodeConfig.model };
          session = connectAcp({
            command,
            args,
            cwd: cwdRef.current[tabLabel] ?? process.cwd(),
            onError: (msg) => appendLog(tabLabel, { input: '', output: `ACP: ${msg}` }),
            onConnect: () => setAcpInfo((prev) => ({ ...prev, [tabIndex]: acpLabel })),
            env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(opencodeConfig) },
          });
          acpRef.current.set(tabIndex, session);
        }
        const acpSession = session;
        const wrapWidth = Math.max(20, (columns || 80) - 6);
        const updateRunning = (output: string, running: boolean) => {
          if (!running && output) appendEntry({ timestamp: getTimeStr(), agent: tabLabel, text: output });
          setTabs((prev) => prev.map((t) => {
            if (t.label !== tabLabel) return t;
            const log = [...t.log];
            const i = log.findLastIndex((e) => e.running);
            if (i >= 0) log[i] = { ...log[i], output, running };
            saveTabLog(t.label, log);
            return { ...t, log };
          }));
        };
        runAcpToolLoop(
          acpSession,
          prompt,
          {
            primer: `${DB_PRIMER}\n\n${BROWSER_PRIMER}`,
            runCommand: (cmd) =>
              /^browser\b/i.test(cmd) ? runBrowserInTab(tabIndex, cmd) : runDbInTab(tabLabel, cmd),
            extractCommand: (text) => extractBrowserCommand(text) ?? extractDbCommand(text),
          },
          {
            startTurn: (isFirst) => {
              setAgentActive(tabLabel, true);
              appendLog(tabLabel, { input: isFirst ? prompt : '', output: '', running: true });
            },
            chunk: (buf) => updateRunning(formatAgentOutput(buf, wrapWidth), true),
            endTurn: (final) => updateRunning(formatAgentOutput(final, wrapWidth), false),
            ranCommand: (cmd, result) => {
              appendLog(tabLabel, { input: cmd, output: result, acp: true });
            },
            finished: (reason, maxSteps) => {
              setAgentActive(tabLabel, false);
              if (reason === 'capped') appendLog(tabLabel, { input: '', output: `(stopped after ${maxSteps} tool steps)` });
            },
            error: (msg) => { updateRunning(wordWrap(`ACP error: ${msg}`, wrapWidth), false); setAgentActive(tabLabel, false); },
          },
        );
        return;
      }
      case 'db': {
        const output = runDbInTab(tabLabel, cliTrimmed);
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output }], scrollOffset: 0 }));
        return;
      }
      case 'browser': {
        appendLog(tabLabel, { input: trimmed, output: '', running: true });
        setAgentActive(tabLabel, true);
        void (async () => {
          const output = await runBrowserInTab(tabIndex, cliTrimmed);
          finishRunning(tabLabel, output);
          setAgentActive(tabLabel, false);
        })();
        return;
      }
      case 'connection': {
        const parsed = parseConnectionCommand(cliTrimmed);
        if (!('error' in parsed) && parsed.action === 'close' && parsed.kind === 'browser') {
          appendLog(tabLabel, { input: trimmed, output: '', running: true });
          void (async () => finishRunning(tabLabel, await closeBrowserWindow(tabIndex, parsed.id)))();
          return;
        }
        let output: string;
        if ('error' in parsed) {
          output = parsed.error;
        } else if (parsed.action === 'list') {
          const lines: string[] = [];
          if (shellsRef.current.get(tabIndex)) lines.push(`shell:${shellName}`);
          if (acpRef.current.get(tabIndex)) lines.push('acp:opencode');
          for (const id of browserRef.current.get(tabIndex)?.browser.windowIds() ?? []) lines.push(`browser:${id}`);
          for (const n of listOpenConnections()) lines.push(`sqlite:${n}`);
          output = lines.length ? lines.join('\n') : 'No open connections.';
        } else if (parsed.kind === 'sqlite') {
          if (closeConnection(parsed.id)) {
            forgetDbConn(parsed.id);
            output = `Closed connection sqlite:${parsed.id}.`;
          } else {
            output = `No open connection sqlite:${parsed.id}.`;
          }
        } else if (parsed.kind === 'shell') {
          if (parsed.id !== shellName) {
            output = `No open connection shell:${parsed.id} (this tab's shell is "${shellName}").`;
          } else if (shellsRef.current.get(tabIndex)) {
            shellsRef.current.get(tabIndex)?.kill();
            shellsRef.current.delete(tabIndex);
            setShellActive((prev) => { const c = { ...prev }; delete c[tabIndex]; return c; });
            output = `Closed connection shell:${shellName}.`;
          } else {
            output = `No open connection shell:${shellName}.`;
          }
        } else {
          if (parsed.id !== 'opencode') {
            output = `No open connection acp:${parsed.id} (the acp agent is "opencode").`;
          } else if (acpRef.current.get(tabIndex)) {
            acpRef.current.get(tabIndex)?.kill();
            acpRef.current.delete(tabIndex);
            setAcpInfo((prev) => { const c = { ...prev }; delete c[tabIndex]; return c; });
            output = 'Closed connection acp:opencode.';
          } else {
            output = 'No open connection acp:opencode.';
          }
        }
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output }], scrollOffset: 0 }));
        return;
      }
      case 'clear':
        updateCurrentTab((tab) => ({ ...tab, log: [], scrollOffset: 0 }));
        return;
      case 'state': {
        const label = tabs[activeTab]?.label;
        const state = loadAgentState(label);
        const formatVal = (v: unknown, maxLines = 10): string => {
          if (v === undefined || v === null) return '<empty>';
          if (typeof v === 'string') return v || '<empty>';
          if (typeof v === 'boolean' || typeof v === 'number') return String(v);
          if (Array.isArray(v)) {
            if (v.length === 0) return '<empty>';
            const lines = v.flatMap((item) => {
              if (typeof item === 'object' && item !== null) {
                const e = item as Record<string, unknown>;
                return [
                  `> ${e.input ?? ''}`,
                  ...(typeof e.output === 'string' && e.output
                    ? e.output.split('\n').map((l) => `  ${l}`)
                    : ['  <empty>']),
                ];
              }
              return [`  - ${JSON.stringify(item)}`];
            });
            if (lines.length <= maxLines) return lines.join('\n');
            return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
          }
          if (typeof v === 'object') {
            const lines = Object.entries(v as Record<string, unknown>).map(
              ([k, val]) => `  ${k}: ${formatVal(val)}`,
            );
            if (lines.length <= maxLines) return lines.join('\n');
            return `... (${lines.length - maxLines} lines omitted)\n${lines.slice(-maxLines).join('\n')}`;
          }
          return String(v);
        };
        const fields = state
          ? Object.entries(state).map(([k, v]) => `${k}:\n${formatVal(v)}`).join('\n\n')
          : `No state file found for "${label}".`;
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: fields }], scrollOffset: 0 }));
        return;
      }
      case 'hist':
        if (frequentHistory.length > 0) {
          setHistoryPickerIdx(frequentHistory.length - 1);
          setHistoryPickerOpen(true);
        }
        return;
      case 'close':
        if (tabs.length <= 1) {
          for (const dir of workspaceRef.current) removeWorkspaceDir(dir);
          workspaceRef.current.clear();
          for (const [, shell] of shellsRef.current) shell.kill();
          shellsRef.current.clear();
          for (const [, session] of acpRef.current) session.kill();
          acpRef.current.clear();
          for (const [, e] of browserRef.current) void e.browser.close();
          browserRef.current.clear();
          closeAllConnections();
          exit();
        } else {
          const closedTab = tabs[tabIndex];
          if (closedTab.workspaceDir) {
            removeWorkspaceDir(closedTab.workspaceDir);
            workspaceRef.current.delete(closedTab.workspaceDir);
          }
          shellsRef.current.get(tabIndex)?.kill();
          shellsRef.current.delete(tabIndex);
          acpRef.current.get(tabIndex)?.kill();
          acpRef.current.delete(tabIndex);
          closeTabBrowser(tabIndex);
          setAcpInfo((prev) => { const copy = { ...prev }; delete copy[tabIndex]; return copy; });
          setShellActive((prev) => { const copy = { ...prev }; delete copy[tabIndex]; return copy; });
          const closedLabel = closedTab.label;
          setTabs((prev) => prev.filter((_, i) => i !== tabIndex));
          setAgentStates((prev) => { const copy = { ...prev }; delete copy[closedLabel]; return copy; });
          setTabDbConns((prev) => { const copy = { ...prev }; delete copy[closedLabel]; return copy; });
          setActiveTab((prev) => Math.min(prev, tabs.length - 2));
        }
        return;
      case 'quit':
        for (const dir of workspaceRef.current) removeWorkspaceDir(dir);
        workspaceRef.current.clear();
        for (const [, shell] of shellsRef.current) shell.kill();
        shellsRef.current.clear();
        for (const [, session] of acpRef.current) session.kill();
        acpRef.current.clear();
        for (const [, e] of browserRef.current) void e.browser.close();
        browserRef.current.clear();
        closeAllConnections();
        exit();
        return;
    }
  };
}
