import React, { useState, useRef, useEffect, useCallback } from 'react';
import { render, Box, useApp, useWindowSize, useStdin } from 'ink';
import { isInteractive, runInteractive, type InteractiveSession } from './interactive.js';
import { useMessaging, parseMsgCommand, parseBroadcastCommand } from './messaging.js';
import { connectAcp, type AcpSession, type AcpInfo } from './acp.js';
import { ConnectionWindow } from './ConnectionWindow.js';
import { resolveAgentName, parseAgentCommand } from './commands.js';
import { resolveCommand } from './resolve.js';
import { type ThemeColors, darkTheme } from './theme.js';
import { spawnShell, executeShellCmd, queryShellPwd } from './shell.js';
import { type AgentState, saveAgentState, loadAgentState, initAgentStateDir, clearStateDir, listAgentStates } from './agent-state.js';
import { useInputHandler, type InputHandlerDeps } from './useInputHandler.js';
import { TabStrip } from './TabStrip.js';
import { Transcript } from './Transcript.js';
import { CommandWindow } from './CommandWindow.js';
import { getFrequentHistory, flattenBuffer, wordWrap, formatAgentOutput, stripComments, type Tab, type LogEntry, dotColors, makeTab } from './tab.js';
import { findRepoRoot, createWorkspace, removeWorkspace as removeWorkspaceDir, initWorkspaceDir, clearWorkspaceDir } from './workspace.js';
import { runDbCommand, parseDbCommand, DB_PRIMER, extractDbCommand } from './db.js';
import { launchTabBrowser, type TabBrowser } from './browser.js';
import { parseBrowserCommand, extractBrowserCommand, BROWSER_PRIMER } from './browser-command.js';
import { runAcpToolLoop } from './acp-loop.js';
import { loadConfig, getConfig } from './config.js';
import { initLogDir, appendEntry, getTimeStr } from './logger.js';
import {
  initDbDir,
  closeConnection,
  closeAllConnections,
  listOpenConnections,
  isConnectionOpen,
  parseConnectionCommand,
} from './connections.js';

// Identifier for a tab's shell connection, e.g. `shell:bash` / `shell:zsh`.
const shellName = (process.env.SHELL || 'bash').split('/').pop() || 'bash';

export const App = () => {
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();
  const theme: ThemeColors = darkTheme;
  const maxLines = getConfig().transcriptMaxLines;
  const capLog = useCallback((log: LogEntry[]): LogEntry[] => {
    if (log.length <= maxLines) return log;
    return log.slice(log.length - maxLines);
  }, [maxLines]);

  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (relaunch) {
      const agents = listAgentStates();
      if (agents.length === 0) return [makeTab('janus', dotColors[0], 1)];
      // Restore in the saved tab-number order, preserving each tab's recorded number.
      const sorted = [...agents].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      return sorted.map((a, i) =>
        makeTab(a.name, a.dotColor ?? dotColors[i % dotColors.length], a.number ?? i + 1, a.cmdHistory ?? [], a.log ?? [], a.workspaceDir),
      );
    }
    return [makeTab('janus', dotColors[0], 1)];
  });
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [activeTab, setActiveTab] = useState(0);
  const [input, setInput] = useState('');
  const [cursor, setCursor] = useState(0);
  const [historyPickerOpen, setHistoryPickerOpen] = useState(false);
  const [historyPickerIdx, setHistoryPickerIdx] = useState(0);
  const [scrollBoundaryHit, setScrollBoundaryHit] = useState(false);
  const flashScrollBoundary = useCallback(() => {
    setScrollBoundaryHit(true);
    setTimeout(() => setScrollBoundaryHit(false), 200);
  }, []);
  const unmountedRef = useRef(false);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const shellsRef = useRef<Map<number, import('node:child_process').ChildProcess>>(new Map());
  const cwdRef = useRef<Record<string, string>>({});
  const { stdin } = useStdin();
  const [interactive, setInteractive] = useState<{ cmd: string; cwd?: string } | null>(null);
  const interactiveRef = useRef<InteractiveSession | null>(null);
  const acpRef = useRef<Map<number, AcpSession>>(new Map());
  const [acpInfo, setAcpInfo] = useState<Record<number, AcpInfo>>({});
  // Per-tab Playwright browser: each tab launches its own process (so modes can differ),
  // holds one or more windows, and tracks the current one. `browserInfo` mirrors the live
  // state into React for the status popup / connection completions.
  const browserRef = useRef<Map<number, { browser: TabBrowser; current?: string; counter: number }>>(new Map());
  const [browserInfo, setBrowserInfo] = useState<Record<number, { mode: string; windows: string[] }>>({});
  const [shellActive, setShellActive] = useState<Record<number, boolean>>({});
  // SQLite databases each tab has opened a connection to (keyed by tab label).
  // Connections are global, but this attributes them to the tab that accessed
  // them so the status popup reflects that tab's connections.
  const [tabDbConns, setTabDbConns] = useState<Record<string, string[]>>({});
  const workspaceRef = useRef<Set<string>>(new Set());

  const getShell = (tabIndex: number, label?: string): import('node:child_process').ChildProcess | null => {
    let shell = shellsRef.current.get(tabIndex);
    const isNew = !shell || shell.exitCode !== null || shell.signalCode !== null;
    if (isNew) {
      shell = spawnShell(tabIndex, label ? { JANUS_AGENT_NAME: label } : undefined);
      shell.on('exit', () => shellsRef.current.delete(tabIndex));
      shell.on('error', () => shellsRef.current.delete(tabIndex));
      shellsRef.current.set(tabIndex, shell);
      setShellActive((prev) => (prev[tabIndex] ? prev : { ...prev, [tabIndex]: true }));
      if (label && cwdRef.current[label]) {
        shell.stdin!.write(`cd "${cwdRef.current[label]}"\n`);
      }
    }
    return shell ?? null;
  };

  useEffect(() => {
    if (relaunch) {
      for (const tab of tabs) {
        const state = initAgentState(tab.label, tab.dotColor);
        if (state.cwd) cwdRef.current[tab.label] = state.cwd;
        if (state.workspaceDir) {
          cwdRef.current[tab.label] = state.workspaceDir;
        }
      }
    } else {
      initAgentState('janus', dotColors[0]);
    }
    return () => {
      unmountedRef.current = true;
      for (const dir of workspaceRef.current) removeWorkspaceDir(dir);
      workspaceRef.current.clear();
      for (const [, shell] of shellsRef.current) shell.kill();
      shellsRef.current.clear();
      for (const [, session] of acpRef.current) session.kill();
      acpRef.current.clear();
      for (const [, e] of browserRef.current) void e.browser.close();
      browserRef.current.clear();
      closeAllConnections();
    };
  }, []);

  // Keep each agent's recorded tab number in sync with its current position so it can be
  // restored on the next launch. Runs whenever tabs are added, swapped, or renumbered.
  useEffect(() => {
    setAgentStates((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const tab of tabs) {
        const cur = next[tab.label];
        if (cur && cur.number !== tab.number) {
          const updated = { ...cur, number: tab.number };
          try { saveAgentState(updated); } catch { /* ignore */ }
          next[tab.label] = updated;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tabs]);

  // Run interactive programs (less, vim, top, ...) in a PTY that owns the real
  // terminal. While `interactive` is set the App renders nothing (see below), so
  // the program's full-screen output is not fought over by Ink.
  useEffect(() => {
    if (!interactive) return;
    const { cmd, cwd } = interactive;
    const out = process.stdout;
    out.write('\x1b[2J\x1b[3J\x1b[H'); // clear the handed-over screen
    const onStdin = (data: Buffer) => interactiveRef.current?.write(data.toString('utf8'));
    stdin?.on('data', onStdin);
    const session = runInteractive({
      cmd,
      cwd,
      cols: columns || 80,
      rows: rows || 24,
      onData: (d) => out.write(d),
      onExit: () => {
        stdin?.removeListener('data', onStdin);
        interactiveRef.current = null;
        out.write('\x1b[2J\x1b[3J\x1b[H');
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: cmd, output: '', cwd }], scrollOffset: 0 }));
        setInteractive(null);
      },
    });
    interactiveRef.current = session;
    return () => {
      stdin?.removeListener('data', onStdin);
      session.kill();
      interactiveRef.current = null;
    };
  }, [interactive]);

  // Keep the PTY sized to the terminal when it is resized mid-session.
  useEffect(() => {
    interactiveRef.current?.resize(columns || 80, rows || 24);
  }, [columns, rows]);

  const cur = tabs[activeTab] ?? tabs[0];
  const buffer = flattenBuffer(cur.log, !cur.toolStepsExpanded);
  const frequentHistory = getFrequentHistory(cur.cmdHistory, 10);
  const totalTabsWidth = tabs.reduce((w, t) => w + 6 + t.label.length, 0);
  const tabRows = Math.max(1, Math.ceil(totalTabsWidth / (columns || 80)));
  const pickerHeight = historyPickerOpen ? Math.min(frequentHistory.length, 10) + 2 : 0;
  const visibleHeight = Math.max(1, rows - tabRows * 3 - 3 - pickerHeight);
  const maxOffset = Math.max(0, buffer.length - visibleHeight);
  const viewportStart = maxOffset - Math.min(cur.scrollOffset, maxOffset);
  const visibleLines = buffer.slice(viewportStart, viewportStart + visibleHeight);

  const updateCurrentTab = (updater: (tab: Tab) => Tab) => {
    setTabs((prev) => {
      let savedLabel: string | undefined;
      let savedLog: LogEntry[] | undefined;
      const result = prev.map((t, i) => {
        if (i !== activeTab) return t;
        const updated = updater(t);
        if (updated.log !== t.log) {
          savedLabel = updated.label;
          for (let j = t.log.length; j < updated.log.length; j++) {
            const e = updated.log[j];
            if (e.input) appendEntry({ timestamp: getTimeStr(), agent: savedLabel, text: e.input });
            if (e.output) appendEntry({ timestamp: getTimeStr(), agent: savedLabel, text: e.output });
          }
          savedLog = capLog(updated.log);
          return { ...updated, log: savedLog };
        }
        return updated;
      });
      if (savedLabel && savedLog) saveTabLog(savedLabel, savedLog);
      return result;
    });
  };

  const setAgentActive = (name: string, active: boolean) => {
    setAgentStates((prev) => {
      const cur = prev[name];
      if (!cur) return prev;
      const updated = { ...cur, active };
      try { saveAgentState(updated); } catch { /* ignore */ }
      return { ...prev, [name]: updated };
    });
  };

  const saveTabLog = (label: string, log: LogEntry[]) => {
    setAgentStates((prev) => {
      const cur = prev[label];
      if (!cur) return prev;
      const updated = { ...cur, log };
      try { saveAgentState(updated); } catch { /* ignore */ }
      return { ...prev, [label]: updated };
    });
  };

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Append a log entry to a specific agent's tab (by label), persisting it. Used to
  // deliver inter-agent messages to a recipient that may not be the active tab.
  const appendLog = (label: string, entry: LogEntry) => {
    setTabs((prev) => {
      let savedLog: LogEntry[] | undefined;
      const result = prev.map((t) => {
        if (t.label !== label) return t;
        if (entry.input) appendEntry({ timestamp: getTimeStr(), agent: label, text: entry.input });
        if (entry.output) appendEntry({ timestamp: getTimeStr(), agent: label, text: entry.output });
        const log = capLog([...t.log, entry]);
        savedLog = log;
        return { ...t, log, scrollOffset: 0 };
      });
      if (savedLog) saveTabLog(label, savedLog);
      return result;
    });
  };

  const appendContext = (label: string, text: string) => {
    setAgentStates((prev) => {
      const existing = prev[label];
      if (!existing) return prev;
      const updated = { ...existing, context: [...(existing.context ?? []), text] };
      try { saveAgentState(updated); } catch { /* ignore */ }
      return { ...prev, [label]: updated };
    });
  };

  // Drop a closed SQLite connection from every tab's tracked list.
  const forgetDbConn = (name: string) => {
    setTabDbConns((prev) => {
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [label, names] of Object.entries(prev)) {
        const filtered = names.filter((n) => n !== name);
        if (filtered.length !== names.length) changed = true;
        next[label] = filtered;
      }
      return changed ? next : prev;
    });
  };

  // Run a `db` command on behalf of a tab and keep that tab's tracked SQLite
  // connections in sync so the status popup reflects what it has open.
  const runDbInTab = (label: string, cmd: string): string => {
    const output = runDbCommand(cmd);
    const parsed = parseDbCommand(cmd);
    if (!('error' in parsed)) {
      if (parsed.action === 'delete') forgetDbConn(parsed.name);
      else if (parsed.action !== 'list' && isConnectionOpen(parsed.name)) {
        setTabDbConns((prev) => {
          const cur = prev[label] ?? [];
          if (cur.includes(parsed.name)) return prev;
          return { ...prev, [label]: [...cur, parsed.name].sort() };
        });
      }
    }
    return output;
  };

  // Finalize a tab's most recent `running` log entry with its output (used by async
  // browser commands, mirroring the acp/shell running-entry pattern).
  const finishRunning = (label: string, output: string) => {
    if (output) appendEntry({ timestamp: getTimeStr(), agent: label, text: output });
    setTabs((prev) => prev.map((t) => {
      if (t.label !== label) return t;
      const log = [...t.log];
      const i = log.findLastIndex((e) => e.running);
      if (i >= 0) log[i] = { ...log[i], output, running: false };
      saveTabLog(t.label, log);
      return { ...t, log };
    }));
  };

  // Mirror a tab's live browser state (mode + window ids) into React state.
  const refreshBrowserInfo = (tabIndex: number) => {
    const entry = browserRef.current.get(tabIndex);
    setBrowserInfo((prev) => {
      const copy = { ...prev };
      if (!entry) delete copy[tabIndex];
      else copy[tabIndex] = { mode: entry.browser.mode, windows: entry.browser.windowIds() };
      return copy;
    });
  };

  // Close one of a tab's browser windows; when it was the last, end that tab's browser
  // process. Shared by `browser close`, `browser window close`, and `connection close`.
  const closeBrowserWindow = async (tabIndex: number, id: string): Promise<string> => {
    const entry = browserRef.current.get(tabIndex);
    if (!entry || !entry.browser.window(id)) return `No open connection browser:${id}.`;
    await entry.browser.closeWindow(id);
    if (entry.current === id) entry.current = entry.browser.windowIds()[0];
    if (entry.browser.windowIds().length === 0) {
      await entry.browser.close();
      browserRef.current.delete(tabIndex);
    }
    refreshBrowserInfo(tabIndex);
    return `Closed connection browser:${id}.`;
  };

  // End a tab's browser process entirely (tab close / app exit). Fire-and-forget.
  const closeTabBrowser = (tabIndex: number) => {
    const entry = browserRef.current.get(tabIndex);
    if (entry) {
      void entry.browser.close();
      browserRef.current.delete(tabIndex);
    }
    refreshBrowserInfo(tabIndex);
  };

  // Execute a `browser ...` command against a tab's own browser, returning the text to
  // show/return. Used by both the interactive `browser` command and the ACP tool loop.
  // For page actions (goto/eval/shot/content) the tab's browser is auto-launched headless
  // and a window auto-opened if none exists yet, so an agent can just say `browser goto`.
  const runBrowserInTab = async (tabIndex: number, cmd: string): Promise<string> => {
    const parsed = parseBrowserCommand(cmd);
    if ('error' in parsed) return parsed.error;

    const ensureCurrent = async () => {
      let entry = browserRef.current.get(tabIndex);
      if (!entry) {
        entry = { browser: await launchTabBrowser(true), counter: 0 };
        browserRef.current.set(tabIndex, entry);
      }
      if (!entry.current || !entry.browser.window(entry.current)) {
        const id = `w${++entry.counter}`;
        await entry.browser.openWindow(id);
        entry.current = id;
      }
      refreshBrowserInfo(tabIndex);
      return entry.browser.window(entry.current)!;
    };

    try {
      switch (parsed.action) {
        case 'open': {
          let entry = browserRef.current.get(tabIndex);
          const notice = entry && parsed.headed && entry.browser.mode === 'headless'
            ? ' (this tab is already running headless; close all windows to relaunch headed)'
            : '';
          if (!entry) {
            entry = { browser: await launchTabBrowser(!parsed.headed), counter: 0 };
            browserRef.current.set(tabIndex, entry);
          }
          const id = `w${++entry.counter}`;
          await entry.browser.openWindow(id);
          entry.current = id;
          refreshBrowserInfo(tabIndex);
          return `Opened browser window ${id} (${entry.browser.mode}).${notice}`;
        }
        case 'list': {
          const entry = browserRef.current.get(tabIndex);
          const ids = entry?.browser.windowIds() ?? [];
          if (ids.length === 0) return 'No browser windows.';
          return ids.map((id) => `${id === entry!.current ? '* ' : '  '}browser:${id}`).join('\n');
        }
        case 'use': {
          const entry = browserRef.current.get(tabIndex);
          if (!entry || !entry.browser.window(parsed.id)) return `No browser window ${parsed.id}.`;
          entry.current = parsed.id;
          return `Using browser window ${parsed.id}.`;
        }
        case 'close': {
          const entry = browserRef.current.get(tabIndex);
          if (!entry?.current) return 'No browser window to close.';
          return await closeBrowserWindow(tabIndex, entry.current);
        }
        case 'closeWindow':
          return await closeBrowserWindow(tabIndex, parsed.id);
        case 'goto':
          return await (await ensureCurrent()).goto(parsed.url);
        case 'eval':
          return await (await ensureCurrent()).eval(parsed.js);
        case 'content':
          return await (await ensureCurrent()).content();
        case 'shot': {
          const path = await (await ensureCurrent()).shot();
          const opened = process.platform === 'darwin' ? ' (opening in Preview)' : '';
          return `Screenshot saved: ${path}${opened}`;
        }
      }
    } catch (e) {
      return `Browser error: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  // Run a shell command in a tab's persistent shell. When `display` is true the command
  // and its output stream into that tab's transcript (matched by label so it works for
  // non-active tabs too); when false the command runs silently and only the captured
  // output is delivered via onComplete. onComplete receives the final output.
  const runShellInTab = (
    tabIndex: number,
    tabLabel: string,
    shellCmd: string,
    onComplete?: (output: string) => void,
    display = true,
  ) => {
    const shell = getShell(tabIndex, tabLabel);
    const shellCwd = cwdRef.current[tabLabel] ?? process.cwd();
    if (!shell || !shell.stdin!.writable) {
      if (display) appendLog(tabLabel, { input: shellCmd, output: 'Failed to start shell.', running: false, cwd: shellCwd });
      onComplete?.('Failed to start shell.');
      return;
    }
    if (display) appendLog(tabLabel, { input: shellCmd, output: '', running: true, cwd: shellCwd });
    setAgentActive(tabLabel, true);
    const updateRunning = (output: string, running: boolean) => {
      if (!display) return;
      if (!running && output) appendEntry({ timestamp: getTimeStr(), agent: tabLabel, text: output });
      setTabs((prev) => prev.map((t) => {
        if (t.label !== tabLabel) return t;
        const log = [...t.log];
        const idx = log.findLastIndex((e) => e.input === shellCmd && e.running);
        if (idx >= 0) log[idx] = { ...log[idx], output, running };
        saveTabLog(t.label, log);
        return { ...t, log };
      }));
    };
    executeShellCmd(shell, shellCmd, tabIndex,
      (outputBuffer) => updateRunning(outputBuffer, true),
      (result) => {
        updateRunning(result, false);
        setAgentActive(tabLabel, false);
        onComplete?.(result);
        queryShellPwd(shell, tabIndex, (pwd) => {
          if (pwd) {
            cwdRef.current[tabLabel] = pwd;
            setAgentStates((prev) => {
              const cur = prev[tabLabel];
              if (!cur) return prev;
              const updated = { ...cur, cwd: pwd };
              try { saveAgentState(updated); } catch { /* ignore */ }
              return { ...prev, [tabLabel]: updated };
            });
          }
        });
      },
    );
  };

  // Execute text in a tab's window using the shared command resolver, capturing the output
  // instead of displaying it (used to fulfil a request whose output is returned to the
  // sender). Interactive (PTY) and app/tab-management commands are refused.
  const runCaptureInTab = (index: number, label: string, text: string, onResult: (output: string) => void) => {
    const res = resolveCommand(text);
    switch (res.kind) {
      case 'empty':
        onResult('');
        return;
      case 'shell':
        if (res.cmd && isInteractive(res.cmd)) {
          onResult(`Cannot run interactive command remotely: ${res.cmd}`);
          return;
        }
        runShellInTab(index, label, res.cmd, (out) => onResult(out), false);
        return;
      case 'output':
        onResult(res.output);
        return;
      case 'app':
        // `db` is self-contained (no live tab state), so it is dispatchable;
        // other app/tab-management commands are not runnable through this path.
        if (res.name === 'db') {
          onResult(runDbInTab(label, res.cmd));
          return;
        }
        onResult(`Command not available remotely: ${res.cmd}`);
        return;
    }
  };

  const { send: sendMessage } = useMessaging({
    hasAgent: (label) => tabsRef.current.some((t) => t.label === label),
    agentColor: (label) => tabsRef.current.find((t) => t.label === label)?.dotColor ?? theme.fg,
    isInteractive,
    appendLog,
    appendContext,
    runShell: (label, cmd, onComplete) => {
      const idx = tabsRef.current.findIndex((t) => t.label === label);
      if (idx < 0) { onComplete(`No agent named "${label}".`); return; }
      runShellInTab(idx, label, cmd, onComplete);
    },
    runCapture: (label, text, onResult) => {
      const idx = tabsRef.current.findIndex((t) => t.label === label);
      if (idx < 0) { onResult(`No agent named "${label}".`); return; }
      runCaptureInTab(idx, label, text, onResult);
    },
  });

  const initAgentState = (name: string, dotColor: string) => {
    const existing = loadAgentState(name);
    const state = existing ?? { name, dotColor, active: false };
    if (!existing) {
      try { saveAgentState(state); } catch { /* ignore */ }
    }
    setAgentStates((prev) => ({ ...prev, [name]: state }));
    return { cmdHistory: state.cmdHistory, log: state.log, cwd: state.cwd, workspaceDir: state.workspaceDir };
  };

  const executeRef = useRef<((cmd: string) => void) | null>(null);
  executeRef.current = (cmd: string) => {
    const trimmed = stripComments(cmd);
    const curTab = tabs[activeTabRef.current];
    const newHistory = curTab && curTab.cmdHistory[curTab.cmdHistory.length - 1] !== trimmed
      ? [...curTab.cmdHistory, trimmed].slice(-100)
      : curTab?.cmdHistory ?? [];

    updateCurrentTab((tab) => {
      if (tab.cmdHistory[tab.cmdHistory.length - 1] === trimmed) return { ...tab, cmdHistoryIdx: -1 };
      return {
        ...tab,
        cmdHistory: newHistory,
        cmdHistoryIdx: -1,
      };
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

    const tabIndex = activeTabRef.current;
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
      updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: res.output }], scrollOffset: 0 }));
      return;
    }

    // res.kind === 'app': built-ins that act on live application state.
    const cliTrimmed = res.cmd;
    switch (res.name) {
      case 'agent': {
        const existingLabels = tabs.map((t) => t.label);
        const parsed = parseAgentCommand(cliTrimmed);
        const cleanInput = parsed.name ? `agent ${parsed.name}` : 'agent';
        const resolved = parsed.name || resolveAgentName(cleanInput, existingLabels);
        if (resolved === null) {
          updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: 'All agent names are in use.' }], scrollOffset: 0 }));
          return;
        }
        if (existingLabels.some((l) => l.toLowerCase() === resolved.toLowerCase())) {
          updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: `Agent "${resolved}" is already active.` }], scrollOffset: 0 }));
          return;
        }
        let workspaceDir: string | undefined;
        if (parsed.workspace) {
          const repoRoot = findRepoRoot(process.cwd());
          if (!repoRoot) {
            updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: 'No git repository found. Cannot create workspace.' }], scrollOffset: 0 }));
            return;
          }
          try {
            workspaceDir = createWorkspace(resolved, repoRoot);
          } catch (e) {
            updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: `Failed to create workspace: ${e instanceof Error ? e.message : String(e)}` }], scrollOffset: 0 }));
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
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: `Agent "${resolved}" ready.${suffix}` }], scrollOffset: 0 }));
        return;
      }
      case 'next':
        setActiveTab((activeTab + 1) % tabs.length);
        return;
      case 'msg': {
        const fromLabel = tabs[activeTabRef.current].label;
        const parsed = parseMsgCommand(cliTrimmed);
        let result: string;
        if ('error' in parsed) {
          result = parsed.error;
        } else if (parsed.to === fromLabel) {
          result = 'Cannot message yourself.';
        } else if (!sendMessage({ from: fromLabel, to: parsed.to, kind: parsed.kind, text: parsed.text })) {
          result = `No agent named "${parsed.to}".`;
        } else {
          result = `Sent ${parsed.kind} to ${parsed.to}.`;
        }
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: result }], scrollOffset: 0 }));
        return;
      }
      case 'broadcast': {
        const fromLabel = tabs[activeTabRef.current].label;
        const parsed = parseBroadcastCommand(cliTrimmed);
        let result: string;
        if ('error' in parsed) {
          result = parsed.error;
        } else {
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
          result = segments.join(' ');
        }
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: result }], scrollOffset: 0 }));
        return;
      }
      case 'acp': {
        const prompt = cliTrimmed.replace(/^acp\b\s*/i, '').trim();
        if (!prompt) {
          updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: 'Usage: acp <prompt>.' }], scrollOffset: 0 }));
          return;
        }
        // Connect on first use.
        let session = acpRef.current.get(tabIndex);
        if (!session) {
          // OpenCode is the hardcoded ACP agent (`opencode acp`).
          const command = 'opencode';
          const args = ['acp'];
          // OpenCode model config (`provider/model`); the popup label is derived from it.
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
        // ACP replies stream as one long line with no newlines, so word-wrap to the
        // transcript's content width (terminal minus borders/padding/scrollbar).
        const wrapWidth = Math.max(20, (columns || 80) - 6);
        // Update the current turn's running log entry (only one runs at a time).
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
        // Autonomous tool loop: the agent issues a single `db` command, the host
        // runs it, feeds the output back, and repeats until it answers without a
        // command — capped to avoid runaway loops.
        runAcpToolLoop(
          acpSession,
          prompt,
          // Prime the agent with both the `db` and `browser` grammars (the loop only
          // applies the primer to the first turn). Each turn it may emit one command of
          // either kind; dispatch by prefix — browser is async, db is sync.
          {
            primer: `${DB_PRIMER}\n\n${BROWSER_PRIMER}`,
            runCommand: (cmd) =>
              /^browser\b/i.test(cmd) ? runBrowserInTab(tabIndex, cmd) : runDbInTab(tabLabel, cmd),
            extractCommand: (text) => extractBrowserCommand(text) ?? extractDbCommand(text),
          },
          {
            // First turn shows the user's prompt; continuation turns have no prompt line.
            startTurn: (isFirst) => {
              setAgentActive(tabLabel, true);
              appendLog(tabLabel, { input: isFirst ? prompt : '', output: '', running: true });
            },
            chunk: (buf) => updateRunning(formatAgentOutput(buf, wrapWidth), true),
            endTurn: (final) => updateRunning(formatAgentOutput(final, wrapWidth), false),
            // Record the auto-run command together with its result as one acp entry, so the
            // response shows beneath the command when the (collapsed-by-default) tool-step
            // run is expanded. `appendLog` writes both the command and the result to the
            // append-only log.
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
        // Browser actions are async (launch/navigate take time): show a running entry,
        // then finalize it with the result.
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
        // Closing a browser window is async; handle it separately with a running entry.
        if (!('error' in parsed) && parsed.action === 'close' && parsed.kind === 'browser') {
          appendLog(tabLabel, { input: trimmed, output: '', running: true });
          void (async () => finishRunning(tabLabel, await closeBrowserWindow(tabIndex, parsed.id)))();
          return;
        }
        let output: string;
        if ('error' in parsed) {
          output = parsed.error;
        } else if (parsed.action === 'list') {
          // SQLite connections are global; shell/acp/browser are this tab's.
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
          // acp — hardcoded to the OpenCode agent.
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
        const label = tabs[activeTabRef.current]?.label;
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
                return [`> ${e.input ?? ''}`, ...(typeof e.output === 'string' && e.output ? e.output.split('\n').map((l) => `  ${l}`) : ['  <empty>'])];
              }
              return [`  - ${JSON.stringify(item)}`];
            });
            if (lines.length <= maxLines) return lines.join('\n');
            return `... (${lines.length - maxLines} lines omitted)\n` + lines.slice(-maxLines).join('\n');
          }
          if (typeof v === 'object') {
            const lines = Object.entries(v as Record<string, unknown>).map(([k, val]) => `  ${k}: ${formatVal(val)}`);
            if (lines.length <= maxLines) return lines.join('\n');
            return `... (${lines.length - maxLines} lines omitted)\n` + lines.slice(-maxLines).join('\n');
          }
          return String(v);
        };
        const fields = state
          ? Object.entries(state)
              .map(([k, v]) => `${k}:\n${formatVal(v)}`)
              .join('\n\n')
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
          const tabIdx = activeTabRef.current;
          const closedTab = tabs[tabIdx];
          if (closedTab.workspaceDir) {
            removeWorkspaceDir(closedTab.workspaceDir);
            workspaceRef.current.delete(closedTab.workspaceDir);
          }
          shellsRef.current.get(tabIdx)?.kill();
          shellsRef.current.delete(tabIdx);
          acpRef.current.get(tabIdx)?.kill();
          acpRef.current.delete(tabIdx);
          closeTabBrowser(tabIdx);
          setAcpInfo((prev) => { const copy = { ...prev }; delete copy[tabIdx]; return copy; });
          setShellActive((prev) => { const copy = { ...prev }; delete copy[tabIdx]; return copy; });
          const closedLabel = closedTab.label;
          setTabs((prev) => prev.filter((_, i) => i !== tabIdx));
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

  // Open connection strings for the active tab — its shell/agent plus all open
  // SQLite connections — offered as `connection close` completions.
  const connectionStrings: string[] = [
    ...(shellsRef.current.get(activeTab) ? [`shell:${shellName}`] : []),
    ...(acpRef.current.get(activeTab) ? ['acp:opencode'] : []),
    ...(browserInfo[activeTab]?.windows ?? []).map((id) => `browser:${id}`),
    ...listOpenConnections().map((n) => `sqlite:${n}`),
  ];

  const inputHandlerDeps: InputHandlerDeps = {
    input, cursor, setInput, setCursor,
    tabs, activeTab, setTabs, setActiveTab,
    updateCurrentTab, executeRef, shellsRef,
    visibleHeight, exit,
    historyPickerOpen, historyPickerIdx, setHistoryPickerOpen, setHistoryPickerIdx,
    frequentHistory, flashScrollBoundary,
    interactive: interactive !== null,
    cwd: cwdRef.current[cur.label] ?? process.cwd(),
    agents: tabs.map((t) => t.label),
    connections: connectionStrings,
  };
  useInputHandler(inputHandlerDeps);

  const beforeCursor = input.slice(0, cursor);
  const afterCursor = input.slice(cursor);
  const scrollPct = maxOffset > 0 ? Math.round((cur.scrollOffset / maxOffset) * 100) : 0;
  const thumbSize = Math.max(1, Math.round((visibleHeight / Math.max(buffer.length, 1)) * visibleHeight));
  const maxThumbOffset = visibleHeight - thumbSize;
  const thumbPos = Math.round((1 - scrollPct / 100) * maxThumbOffset);
  const scrollChars = Array.from({ length: visibleHeight }, (_, i) =>
    i >= thumbPos && i < thumbPos + thumbSize ? '█' : '·',
  );

  // An interactive program (less/vim/...) owns the terminal; render nothing so
  // Ink does not draw over its full-screen output.
  if (interactive) return null;

  // SQLite connections this tab has open (filtered against the live registry).
  const dbConns = (tabDbConns[cur.label] ?? []).filter(isConnectionOpen);

  return (
    <Box flexDirection="column" height={rows}>
      <TabStrip tabs={tabs} agentStates={agentStates} activeTab={activeTab} theme={theme} scrollBoundaryHit={scrollBoundaryHit} />
      <Transcript visibleLines={visibleLines} scrollChars={scrollChars} visibleHeight={visibleHeight} dotColor={cur.dotColor} theme={theme} />
      <CommandWindow beforeCursor={beforeCursor} afterCursor={afterCursor} dotColor={cur.dotColor} theme={theme} historyItems={frequentHistory} historySelectedIdx={historyPickerIdx} historyOpen={historyPickerOpen} />
      {(shellActive[activeTab] || acpInfo[activeTab] || dbConns.length > 0 || (browserInfo[activeTab]?.windows.length ?? 0) > 0) && (
        <ConnectionWindow
          shell={shellActive[activeTab] ? process.env.SHELL || 'bash' : undefined}
          cwd={cwdRef.current[cur.label] ?? process.cwd()}
          provider={acpInfo[activeTab]?.provider}
          dbConnections={dbConns}
          browserWindows={(browserInfo[activeTab]?.windows ?? []).map(
            (id) => `browser:${id} (${browserInfo[activeTab]?.mode})`,
          )}
          theme={theme}
        />
      )}
    </Box>
  );
};

// node:sqlite emits an ExperimentalWarning on first use; adding any 'warning'
// listener suppresses Node's default stderr printer, which would corrupt the
// Ink alternate-screen UI.
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
});

initAgentStateDir(process.cwd());
initWorkspaceDir(process.cwd());
// Databases persist across launches, so the db dir is initialized but never cleared.
initDbDir(process.cwd());
initLogDir(process.cwd());

loadConfig(process.cwd());

const relaunch = process.argv.includes('--relaunch');
if (!relaunch) {
  clearStateDir();
  clearWorkspaceDir();
}

if (!process.env.VITEST) {
  render(<App />, { alternateScreen: true, exitOnCtrlC: false });
}
