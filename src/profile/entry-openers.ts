import { makeTab } from '../tab/index.js';
import { HARNESS_COMMANDS } from '../harness/index.js';
import { isKnownModel } from '../harness/models.js';
import { buildHarnessSchedule } from './harness-schedule.js';
import type { Managers } from '../managers.js';
import type { AgentState, ProfileHarnessEntry } from '../types.js';

export function openAgentEntry(state: AgentState, managers: Managers, group: number, groupColor: string, dotColor: string): void {
  const log = state.log ?? [];
  const tab = makeTab(state.name, dotColor, managers.tab.tabs.length + 1, state.cmdHistory ?? [],
    log, state.workspaceDir, group, groupColor);
  tab.toolStepsExpanded = false;
  managers.tab.tabs = [...managers.tab.tabs, tab];
  if (state.cwd) managers.tab.setCwd(state.name, state.cwd);
  if (state.context) managers.tab.setContext(state.name, state.context);
  if (state.schedule) managers.schedule.set(state.name, state.schedule);
  managers.tab.persist(managers.tab.buildAgentState(tab, { schedule: state.schedule }));
}

// Validate and open a harness entry. Returns an error to report and skip on, or undefined once
// the tab (and its schedule) is set up.
export function openHarnessEntry(
  entry: ProfileHarnessEntry, managers: Managers, group: number, groupColor: string,
  issuingCwd: string, notes: string[],
): string | undefined {
  if (HARNESS_COMMANDS[entry.harness] === undefined) return `unknown harness "${entry.harness}"`;
  if (entry.model && !isKnownModel(entry.harness, entry.model)) {
    return `Unknown model "${entry.model}" for harness "${entry.harness}" — add it to harness-models.json.`;
  }
  // Mirror `parseHarnessCommand`: -y is claude-only. Report and skip rather than open unsafely.
  if (entry.autoApprove && entry.harness !== 'claude') return 'autoApprove (-y) is only supported for the claude harness';
  const withCwd: ProfileHarnessEntry = { ...entry, cwd: entry.cwd ?? issuingCwd };
  const error = managers.harness.openFromProfile(withCwd, entry.label, group, groupColor);
  if (error) return error;
  const schedule = buildHarnessSchedule(entry, (message) => { notes.push(message); });
  if (schedule.length > 0) managers.schedule.set(entry.label, schedule);
  return undefined;
}
