import React, { useState, useRef, useEffect, useCallback } from 'react';
import { render, Box, useApp, useWindowSize, useStdin } from 'ink';
import { isInteractive, runInteractive, type InteractiveSession } from './interactive.js';
import { useMessaging, parseMsgCommand } from './messaging.js';
import { resolveAgentName } from './commands.js';
import { resolveCommand } from './resolve.js';
import { type ThemeColors, darkTheme } from './theme.js';
import { spawnShell, executeShellCmd, queryShellPwd } from './shell.js';
import { type AgentState, saveAgentState, loadAgentState, initAgentStateDir, clearStateDir, listAgentStates } from './agent-state.js';
import { useInputHandler, type InputHandlerDeps } from './useInputHandler.js';
import { TabStrip } from './TabStrip.js';
import { Transcript } from './Transcript.js';
import { PromptBar } from './PromptBar.js';
import { getFrequentHistory, flattenBuffer, type Tab, type LogEntry, dotColors, makeTab } from './tab.js';

export const App = () => {
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();
  const theme: ThemeColors = darkTheme;

  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (relaunch) {
      const agents = listAgentStates();
      if (agents.length === 0) return [makeTab('janus', dotColors[0], 1)];
      // Restore in the saved tab-number order, preserving each tab's recorded number.
      const sorted = [...agents].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      return sorted.map((a, i) =>
        makeTab(a.name, a.dotColor ?? dotColors[i % dotColors.length], a.number ?? i + 1, a.cmdHistory ?? [], a.log ?? []),
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

  const getShell = (tabIndex: number, label?: string): import('node:child_process').ChildProcess | null => {
    let shell = shellsRef.current.get(tabIndex);
    const isNew = !shell || shell.exitCode !== null || shell.signalCode !== null;
    if (isNew) {
      shell = spawnShell(tabIndex);
      shell.on('exit', () => shellsRef.current.delete(tabIndex));
      shell.on('error', () => shellsRef.current.delete(tabIndex));
      shellsRef.current.set(tabIndex, shell);
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
      }
    } else {
      initAgentState('janus', dotColors[0]);
    }
    return () => {
      unmountedRef.current = true;
      for (const [, shell] of shellsRef.current) shell.kill();
      shellsRef.current.clear();
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
  const buffer = flattenBuffer(cur.log);
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
          savedLog = updated.log;
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
        const log = [...t.log, entry];
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

  // Run a shell command in a tab's persistent shell, streaming output into that tab's
  // transcript (matched by label so it works for non-active tabs too). onComplete
  // receives the final output once the command finishes.
  const runShellInTab = (tabIndex: number, tabLabel: string, shellCmd: string, onComplete?: (output: string) => void) => {
    const shell = getShell(tabIndex, tabLabel);
    const shellCwd = cwdRef.current[tabLabel] ?? process.cwd();
    if (!shell || !shell.stdin!.writable) {
      appendLog(tabLabel, { input: shellCmd, output: 'Failed to start shell.', running: false, cwd: shellCwd });
      onComplete?.('Failed to start shell.');
      return;
    }
    appendLog(tabLabel, { input: shellCmd, output: '', running: true, cwd: shellCwd });
    setAgentActive(tabLabel, true);
    const updateRunning = (output: string, running: boolean) => {
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

  // Process text in a tab's window as if it were typed into that tab's prompt, using the
  // shared command resolver. Interactive (PTY) and app/tab-management commands cannot be
  // run on behalf of another agent and are refused.
  const runWindowInTab = (index: number, label: string, text: string, onComplete?: () => void) => {
    const res = resolveCommand(text);
    switch (res.kind) {
      case 'empty':
        onComplete?.();
        return;
      case 'shell':
        if (res.cmd && isInteractive(res.cmd)) {
          appendLog(label, { input: res.cmd, output: `Cannot run interactive command remotely: ${res.cmd}` });
          onComplete?.();
          return;
        }
        runShellInTab(index, label, res.cmd, () => onComplete?.());
        return;
      case 'output':
        appendLog(label, { input: res.cmd, output: res.output });
        onComplete?.();
        return;
      case 'app':
        appendLog(label, { input: res.cmd, output: `Command not available remotely: ${res.cmd}` });
        onComplete?.();
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
    runWindow: (label, text, onComplete) => {
      const idx = tabsRef.current.findIndex((t) => t.label === label);
      if (idx < 0) { onComplete(); return; }
      runWindowInTab(idx, label, text, onComplete);
    },
  });

  const initAgentState = (name: string, dotColor: string) => {
    const existing = loadAgentState(name);
    const state = existing ?? { name, dotColor, active: false };
    if (!existing) {
      try { saveAgentState(state); } catch { /* ignore */ }
    }
    setAgentStates((prev) => ({ ...prev, [name]: state }));
    return { cmdHistory: state.cmdHistory, log: state.log, cwd: state.cwd };
  };

  const executeRef = useRef<((cmd: string) => void) | null>(null);
  executeRef.current = (cmd: string) => {
    const trimmed = cmd.trim();
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
        const resolved = resolveAgentName(cliTrimmed, existingLabels);
        if (resolved === null) {
          updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: 'All agent names are in use.' }], scrollOffset: 0 }));
          return;
        }
        if (existingLabels.some((l) => l.toLowerCase() === resolved.toLowerCase())) {
          updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: `Agent "${resolved}" is already active.` }], scrollOffset: 0 }));
          return;
        }
        const newTabIndex = tabs.length;
        const dotColor = dotColors[newTabIndex % dotColors.length];
        const { cmdHistory, log } = initAgentState(resolved, dotColor);
        setTabs((prev) => [...prev, makeTab(resolved, dotColor, newTabIndex + 1, cmdHistory ?? [], log ?? [])]);
        setActiveTab(newTabIndex);
        updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: trimmed, output: `Agent "${resolved}" ready.` }], scrollOffset: 0 }));
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
          for (const [, shell] of shellsRef.current) shell.kill();
          shellsRef.current.clear();
          exit();
        } else {
          const tabIdx = activeTabRef.current;
          shellsRef.current.get(tabIdx)?.kill();
          shellsRef.current.delete(tabIdx);
          const closedLabel = tabs[tabIdx].label;
          setTabs((prev) => prev.filter((_, i) => i !== tabIdx));
          setAgentStates((prev) => { const copy = { ...prev }; delete copy[closedLabel]; return copy; });
          setActiveTab((prev) => Math.min(prev, tabs.length - 2));
        }
        return;
      case 'quit':
        for (const [, shell] of shellsRef.current) shell.kill();
        shellsRef.current.clear();
        exit();
        return;
    }
  };

  const inputHandlerDeps: InputHandlerDeps = {
    input, cursor, setInput, setCursor,
    tabs, activeTab, setTabs, setActiveTab,
    updateCurrentTab, executeRef, shellsRef,
    visibleHeight, exit,
    historyPickerOpen, historyPickerIdx, setHistoryPickerOpen, setHistoryPickerIdx,
    frequentHistory, flashScrollBoundary,
    interactive: interactive !== null,
    cwd: cwdRef.current[cur.label] ?? process.cwd(),
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

  return (
    <Box flexDirection="column" height={rows}>
      <TabStrip tabs={tabs} agentStates={agentStates} activeTab={activeTab} theme={theme} scrollBoundaryHit={scrollBoundaryHit} />
      <Transcript visibleLines={visibleLines} scrollChars={scrollChars} visibleHeight={visibleHeight} dotColor={cur.dotColor} theme={theme} />
      <PromptBar beforeCursor={beforeCursor} afterCursor={afterCursor} dotColor={cur.dotColor} theme={theme} historyItems={frequentHistory} historySelectedIdx={historyPickerIdx} historyOpen={historyPickerOpen} />
    </Box>
  );
};

initAgentStateDir(process.cwd());

const relaunch = process.argv.includes('--relaunch');
if (!relaunch) clearStateDir();

if (!process.env.VITEST) {
  render(<App />, { alternateScreen: true, exitOnCtrlC: false });
}
