import React, { useState, useRef, useEffect, useCallback } from 'react';
import { render, Box, useApp, useWindowSize, useStdin } from 'ink';
import { isInteractive, runInteractive } from './interactive.js';
import { useMessaging } from './messaging.js';
import { ConnectionWindow } from './ConnectionWindow.js';
import { ScheduleWindow } from './ScheduleWindow.js';
import { darkTheme } from './theme.js';
import { executeShellCmd, queryShellPwd } from './shell.js';
import { useShellManager } from './useShellManager.js';
import { saveAgentState, initAgentStateDir, clearStateDir } from './agent-state.js';
import { useInputHandler } from './useInputHandler.js';
import { createCommandHandler } from './command-handler.js';
import { useTabsState } from './useTabsState.js';
import { useScheduler } from './useScheduler.js';
import { TabStrip } from './TabStrip.js';
import { Transcript } from './Transcript.js';
import { CommandWindow } from './CommandWindow.js';
import { getFrequentHistory, flattenBuffer, dotColors } from './tab.js';
import { initWorkspaceDir, clearWorkspaceDir, removeWorkspace as removeWorkspaceDir } from './workspace.js';
import { runDbCommand, parseDbCommand } from './db.js';
import { launchTabBrowser } from './browser.js';
import type {
  InteractiveSession, AcpSession, AcpInfo, ThemeColors, InputHandlerDeps, LogEntry, TabBrowser,
} from './types.js';
import { parseBrowserCommand } from './browser-command.js';
import { resolveCommand } from './resolve.js';
import { loadConfig, getConfig } from './config.js';
import { appendEntry, getTimeStr } from './logger.js';
import { initLogDir } from './logger.js';
import {
  initDbDir,
  closeAllConnections,
  listOpenConnections,
  isConnectionOpen,
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

  const {
    tabs, setTabs, agentStates, setAgentStates, activeTab, setActiveTab,
    tabsRef, updateCurrentTab, updateTab, setAgentActive, saveTabLog,
    appendLog, appendContext, initAgentState, finishRunning,
  } = useTabsState(relaunch, capLog);

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
  const { shellsRef, cwdRef, shellActive, setShellActive, getShell } = useShellManager();
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
  // SQLite databases each tab has opened a connection to (keyed by tab label).
  // Connections are global, but this attributes them to the tab that accessed
  // them so the status popup reflects that tab's connections.
  const [tabDbConns, setTabDbConns] = useState<Record<string, string[]>>({});
  const workspaceRef = useRef<Set<string>>(new Set());

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

  const executeRef = useRef<((cmd: string, targetIdx?: number) => void) | null>(null);
  executeRef.current = createCommandHandler({
    tabs,
    activeTab,
    updateCurrentTab,
    updateTab,
    setTabs,
    setActiveTab,
    setInteractive,
    setHistoryPickerOpen,
    setHistoryPickerIdx,
    setAgentStates,
    setAcpInfo,
    setShellActive,
    setTabDbConns,
    exit,
    shellsRef,
    acpRef,
    browserRef,
    cwdRef,
    workspaceRef,
    runShellInTab,
    runBrowserInTab,
    runDbInTab,
    finishRunning,
    closeBrowserWindow,
    closeTabBrowser,
    forgetDbConn,
    appendLog,
    initAgentState,
    sendMessage,
    saveTabLog,
    setAgentActive,
    shellName,
    columns,
    frequentHistory,
  });

  useScheduler({ tabsRef, agentStates, setAgentStates, executeRef });

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

  // The connection window floats at top=3; the schedule window stacks directly below it, so
  // its top offset depends on the connection window's rendered height (border + body lines).
  const connShown =
    shellActive[activeTab] || !!acpInfo[activeTab] || dbConns.length > 0
    || (browserInfo[activeTab]?.windows.length ?? 0) > 0;
  const connBodyLines =
    (shellActive[activeTab] ? 1 : 0)
    + (acpInfo[activeTab]?.provider ? 1 : 0)
    + (browserInfo[activeTab]?.windows.length ?? 0)
    + dbConns.length;
  const schedule = agentStates[cur.label]?.schedule ?? [];

  return (
    <Box flexDirection="column" height={rows}>
      <TabStrip tabs={tabs} agentStates={agentStates} activeTab={activeTab} theme={theme} scrollBoundaryHit={scrollBoundaryHit} />
      <Transcript visibleLines={visibleLines} scrollChars={scrollChars} visibleHeight={visibleHeight} dotColor={cur.dotColor} theme={theme} />
      <CommandWindow beforeCursor={beforeCursor} afterCursor={afterCursor} dotColor={cur.dotColor} theme={theme} historyItems={frequentHistory} historySelectedIdx={historyPickerIdx} historyOpen={historyPickerOpen} />
      {connShown && (
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
      {schedule.length > 0 && (
        <ScheduleWindow entries={schedule} top={3 + (connShown ? connBodyLines + 2 : 0)} theme={theme} />
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
