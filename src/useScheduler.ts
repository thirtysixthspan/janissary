import { useEffect, useRef } from 'react';
import { saveAgentState } from './agent-state.js';
import { computeNextRun } from './schedule.js';
import type { AgentState, ScheduleEntry, Tab } from './types.js';

type SchedulerDeps = {
  tabsRef: { current: Tab[] };
  agentStates: Record<string, AgentState>;
  setAgentStates: (updater: (prev: Record<string, AgentState>) => Record<string, AgentState>) => void;
  executeRef: { current: ((cmd: string, targetIdx?: number) => void) | null };
};

// Fire each open agent's due scheduled commands. One interval drives the whole app; it reads
// from refs so idle ticks cause no re-render, and a fired command runs in its owning tab "as
// if manually entered" via the dispatcher (tagged with a `## scheduled ##` comment). A firing
// is skipped for agents whose tab isn't currently open — the entry stays in the state file.
export function useScheduler({ tabsRef, agentStates, setAgentStates, executeRef }: SchedulerDeps): void {
  const statesRef = useRef(agentStates);
  statesRef.current = agentStates;

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const tabs = tabsRef.current;
      for (let idx = 0; idx < tabs.length; idx++) {
        const label = tabs[idx].label;
        const state = statesRef.current[label];
        const schedule = state?.schedule;
        if (!schedule || schedule.length === 0) continue;

        let changed = false;
        const remaining: ScheduleEntry[] = [];
        for (const entry of schedule) {
          if (entry.nextRun > now) {
            remaining.push(entry);
            continue;
          }
          changed = true;
          executeRef.current?.(`${entry.command} ## scheduled ##`, idx);
          if (entry.recurring) remaining.push({ ...entry, nextRun: computeNextRun(entry, new Date()) });
        }
        if (!changed) continue;

        // Advance the ref now so a tick before the next re-render won't re-fire the same entry.
        statesRef.current = { ...statesRef.current, [label]: { ...state, schedule: remaining } };
        setAgentStates((prev) => {
          const cur = prev[label];
          if (!cur) return prev;
          const updated = { ...cur, schedule: remaining };
          try { saveAgentState(updated); } catch { /* ignore */ }
          return { ...prev, [label]: updated };
        });
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
}
