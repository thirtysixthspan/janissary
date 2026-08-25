import { makeTab, insertTabInGroup } from '../tab/index.js';
import { HARNESS_COMMANDS } from '../harness/index.js';
import { supportsHarnessAutoApprove } from '../harness/auto-approve.js';
import { isKnownModel } from '../harness/models.js';
import { buildHarnessSchedule } from './harness-schedule.js';
import { expandUserPath } from '../paths.js';
import type { Managers } from '../managers.js';
import type { AgentState } from '../agent/types.js';
import type { ProfileHarnessEntry } from './types.js';
import { parseRemoteAddress } from '../remote/address.js';
import { startRemoteAgent } from './remote-agent.js';
import { notify } from '../notifications.js';

// Open an agent entry. Returns an error to report and skip on (only a remote entry can produce
// one — its address is re-validated at launch, since a profile file is authored by hand), or
// undefined once the tab is set up. A remote entry reconnects to the same host and lets the remote
// server resolve a fresh workspace, so it carries no `cwd`, `log`, or `context` to restore.
export function openAgentEntry(
  state: AgentState, managers: Managers, group: number, groupColor: string, dotColor: string,
): string | undefined {
  if (state.remote !== undefined) {
    const address = parseRemoteAddress(state.remote);
    if ('error' in address) return address.error;
    startRemoteAgent(managers, {
      resolved: state.name, address, offline: state.offline ?? false,
      cwd: managers.tab.launchDir, presentation: { dotColor, group, groupColor },
      out: (text) => { notify(managers, 'manual', state.name, text); },
    });
    return undefined;
  }
  const log = state.log ?? [];
  const tab = makeTab(state.name, dotColor, managers.tab.tabs.length + 1, state.cmdHistory ?? [],
    log, state.workspaceDir, group, groupColor);
  tab.toolStepsExpanded = false;
  managers.tab.tabs = insertTabInGroup(managers.tab.tabs, tab);
  if (state.cwd) managers.tab.setCwd(state.name, expandUserPath(state.cwd, { root: managers.tab.launchDir }));
  if (state.context) managers.tab.setContext(state.name, state.context);
  if (state.schedule) managers.schedule.set(state.name, state.schedule);
  managers.tab.persist(managers.tab.buildAgentState(tab, { schedule: state.schedule }));
  return undefined;
}

// Validate and open a harness entry. Returns an error to report and skip on, or undefined once
// the tab (and its schedule) is set up.
export function openHarnessEntry(
  entry: ProfileHarnessEntry, managers: Managers, group: number, groupColor: string,
  issuingCwd: string, notes: string[],
): string | undefined {
  if (HARNESS_COMMANDS[entry.tool] === undefined) return `unknown tool "${entry.tool}"`;
  if (entry.model && !isKnownModel(entry.tool, entry.model)) {
    return `Unknown model "${entry.model}" for harness "${entry.tool}" — add it to harness-models.json.`;
  }
  // Mirror `parseHarnessCommand`: -y is supported for claude and codex. Report and skip rather than open unsafely.
  if (entry.autoApprove && !supportsHarnessAutoApprove(entry.tool)) {
    return 'autoApprove (-y) is only supported for the claude and codex harnesses';
  }
  const cwd = entry.cwd ? expandUserPath(entry.cwd, { root: managers.tab.launchDir }) : issuingCwd;
  const withCwd: ProfileHarnessEntry = { ...entry, cwd };
  const error = managers.harness.openFromProfile(withCwd, entry.name, group, groupColor);
  if (error) return error;
  const schedule = buildHarnessSchedule(entry, (message) => { notes.push(message); });
  if (schedule.length > 0) managers.schedule.set(entry.name, schedule);
  return undefined;
}
