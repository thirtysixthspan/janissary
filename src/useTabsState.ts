import { useState, useRef, useEffect } from 'react';
import { saveAgentState, loadAgentState, listAgentStates } from './agent-state.js';
import { appendEntry, getTimeStr } from './logger.js';
import { dotColors, makeTab } from './tab.js';
import type { AgentState, Tab, LogEntry } from './types.js';

export function useTabsState(relaunch: boolean, capLog: (log: LogEntry[]) => LogEntry[]) {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    if (relaunch) {
      const agents = listAgentStates();
      if (agents.length === 0) return [makeTab('janus', dotColors[0], 1)];
      const sorted = [...agents].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
      return sorted.map((a, i) =>
        makeTab(a.name, a.dotColor ?? dotColors[i % dotColors.length], a.number ?? i + 1, a.cmdHistory ?? [], a.log ?? [], a.workspaceDir),
      );
    }
    return [makeTab('janus', dotColors[0], 1)];
  });
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [activeTab, setActiveTab] = useState(0);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

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

  const initAgentState = (name: string, dotColor: string) => {
    const existing = loadAgentState(name);
    const state = existing ?? { name, dotColor, active: false };
    if (!existing) {
      try { saveAgentState(state); } catch { /* ignore */ }
    }
    setAgentStates((prev) => ({ ...prev, [name]: state }));
    return { cmdHistory: state.cmdHistory, log: state.log, cwd: state.cwd, workspaceDir: state.workspaceDir };
  };

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

  return {
    tabs, setTabs,
    agentStates, setAgentStates,
    activeTab, setActiveTab,
    tabsRef,
    updateCurrentTab,
    setAgentActive,
    saveTabLog,
    appendLog,
    appendContext,
    initAgentState,
    finishRunning,
  };
}
