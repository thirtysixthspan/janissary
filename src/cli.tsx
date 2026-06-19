import React, { useState, useRef, useEffect, useCallback } from 'react';
import { render, Box, useApp, useWindowSize } from 'ink';
import { getOutput, resolveAgentName } from './commands.js';
import shellCommands from './shell-commands.js';
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
      return agents.map((a, i) => makeTab(a.name, dotColors[i % dotColors.length], i + 1, a.cmdHistory ?? [], a.log ?? []));
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

    if (trimmed.startsWith('`')) {
      const shellCmd = trimmed.slice(1).trim();
      const tabIndex = activeTabRef.current;
      const tabLabel = tabs[tabIndex].label;
      const shell = getShell(tabIndex, tabLabel);
      const shellCwd = cwdRef.current[tabLabel] ?? process.cwd();
        if (!shell || !shell.stdin!.writable) {
          updateCurrentTab((tab) => ({
            ...tab,
            log: [...tab.log, { input: shellCmd, output: 'Failed to start shell.', running: false, cwd: shellCwd }],
            scrollOffset: 0,
          }));
          return;
        }
        updateCurrentTab((tab) => ({
          ...tab,
          log: [...tab.log, { input: shellCmd, output: '', running: true, cwd: shellCwd }],
          scrollOffset: 0,
        }));
      setAgentActive(tabLabel, true);
      executeShellCmd(shell, shellCmd, tabIndex,
        (outputBuffer) => {
          setTabs((prev) => prev.map((t, i) => {
            if (i !== tabIndex) return t;
            const log = [...t.log];
            const idx = log.findLastIndex((e) => e.input === shellCmd && e.running);
            if (idx >= 0) log[idx] = { ...log[idx], output: outputBuffer };
            saveTabLog(t.label, log);
            return { ...t, log };
          }));
        },
        (result) => {
          setTabs((prev) => prev.map((t, i) => {
            if (i !== tabIndex) return t;
            const log = [...t.log];
            const idx = log.findLastIndex((e) => e.input === shellCmd && e.running);
            if (idx >= 0) log[idx] = { ...log[idx], output: result, running: false };
            saveTabLog(t.label, log);
            return { ...t, log };
          }));
          setAgentActive(tabLabel, false);
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
      return;
    }

    const cliTrimmed = trimmed.replace(/^\//, '');

    if (/^agent\b/i.test(cliTrimmed)) {
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

    if (cliTrimmed.toLowerCase() === 'next') {
      setActiveTab((activeTab + 1) % tabs.length);
      return;
    }

    const output = getOutput(cliTrimmed);
    if (output === null) {
      if (cliTrimmed.toLowerCase() === 'clear') {
        updateCurrentTab((tab) => ({ ...tab, log: [], scrollOffset: 0 }));
        return;
      }
      if (cliTrimmed.toLowerCase() === 'state') {
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
      if (cliTrimmed.toLowerCase() === 'hist') {
        if (frequentHistory.length > 0) {
          setHistoryPickerIdx(frequentHistory.length - 1);
          setHistoryPickerOpen(true);
        }
        return;
      }
      if (cliTrimmed.toLowerCase() === 'close') {
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
      }
      if (['quit', 'exit'].includes(cliTrimmed.toLowerCase())) {
        for (const [, shell] of shellsRef.current) shell.kill();
        shellsRef.current.clear();
        exit();
        return;
      }
      return;
    }

    const baseCmd = cliTrimmed.split(/\s+/)[0]?.toLowerCase();
    if (output.startsWith('Unknown command') && baseCmd && shellCommands[baseCmd]?.enabled) {
      executeRef.current!('`' + cliTrimmed);
      return;
    }
    updateCurrentTab((tab) => ({
      ...tab,
      log: [...tab.log, { input: trimmed, output }],
      scrollOffset: 0,
    }));
  };

  const inputHandlerDeps: InputHandlerDeps = {
    input, cursor, setInput, setCursor,
    tabs, activeTab, setTabs, setActiveTab,
    updateCurrentTab, executeRef, shellsRef,
    visibleHeight, exit,
    historyPickerOpen, historyPickerIdx, setHistoryPickerOpen, setHistoryPickerIdx,
    frequentHistory, flashScrollBoundary,
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
  render(<App />, { alternateScreen: true });
}
