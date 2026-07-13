import { distinctColor, makeTab } from './tab.js';
import { HARNESS_COMMANDS } from './harness/index.js';
import { isKnownModel } from './harness/models.js';
import { parseScheduleCommand } from './schedule/index.js';
import type { Managers } from './managers.js';
import type { AgentState, ProfileEntry, ProfileHarnessEntry, ScheduleEntry } from './types.js';

function isHarnessEntry(e: ProfileEntry): e is ProfileHarnessEntry {
  return 'harness' in e;
}

function labelOf(e: ProfileEntry): string {
  return isHarnessEntry(e) ? e.label : e.name;
}

// Authored `schedule` strings (schedule-command grammar minus `in <tab>`) plus `run` one-shots,
// parsed into the ScheduleEntry[] the harness tab's schedule is set to. A string that errors or
// carries an `in <tab>` clause is reported and skipped; a duplicate name keeps the first.
function buildHarnessSchedule(entry: ProfileHarnessEntry, report: (message: string) => void): ScheduleEntry[] {
  const now = new Date();
  const entries: ScheduleEntry[] = [];
  const ids = new Set<string>();
  const scheduleLines = entry.schedule ?? [];
  for (const raw of scheduleLines) {
    const parsed = parseScheduleCommand(raw, now);
    if ('error' in parsed) { report(`Schedule "${raw}" for "${entry.label}": ${parsed.error}`); continue; }
    if (parsed.action !== 'add') { report(`Schedule "${raw}" for "${entry.label}" is not a new schedule.`); continue; }
    if (parsed.target !== undefined) { report(`Schedule "${raw}" for "${entry.label}" cannot target another tab.`); continue; }
    if (ids.has(parsed.name)) { report(`Duplicate schedule name "${parsed.name}" for "${entry.label}"; kept the first.`); continue; }
    ids.add(parsed.name);
    entries.push({ ...parsed.entry, id: parsed.name });
  }
  const runLines = entry.run ?? [];
  for (const [i, command] of runLines.entries()) {
    entries.push({ id: `run-${i + 1}`, command, spec: 'once', nextRun: Date.now(), recurring: false });
  }
  return entries;
}

function openAgentEntry(state: AgentState, managers: Managers, group: number, groupColor: string, dotColor: string): void {
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
function openHarnessEntry(
  entry: ProfileHarnessEntry, managers: Managers, group: number, groupColor: string,
  issuingCwd: string, notes: string[],
): string | undefined {
  if (HARNESS_COMMANDS[entry.harness] === undefined) return `unknown harness "${entry.harness}"`;
  if (entry.model && !isKnownModel(entry.harness, entry.model)) {
    return `Unknown model "${entry.model}" for harness "${entry.harness}" — add it to harness-models.json.`;
  }
  const withCwd: ProfileHarnessEntry = { ...entry, cwd: entry.cwd ?? issuingCwd };
  const error = managers.harness.openFromProfile(withCwd, entry.label, group, groupColor);
  if (error) return error;
  const schedule = buildHarnessSchedule(entry, (message) => { notes.push(message); });
  if (schedule.length > 0) managers.schedule.set(entry.label, schedule);
  return undefined;
}

// Relaunch semantics: close every open tab matching an entry's label first, then the caller opens
// all entries fresh, so label collisions between a closing tab and an opening one cannot arise.
// The issuing tab is never closed; if it's named by an entry, that entry is skipped instead.
function closeMatchingTabs(
  entries: ProfileEntry[], managers: Managers, issuingLabel: string, skipped: string[], notes: string[],
): ProfileEntry[] {
  const toOpen: ProfileEntry[] = [];
  for (const entry of entries) {
    const label = labelOf(entry);
    if (label.toLowerCase() === issuingLabel.toLowerCase()) {
      skipped.push(`${label} (cannot relaunch the issuing tab)`);
      continue;
    }
    const index = managers.tab.findIndex(label);
    if (index !== -1) {
      managers.tab.closeTab(index);
      notes.push(`Relaunched "${label}".`);
    }
    toOpen.push(entry);
  }
  return toOpen;
}

export function openProfileEntries(
  entries: ProfileEntry[],
  managers: Managers,
  name: string,
  issuingLabel: string,
  out: (text: string) => void,
): void {
  const authoredGroup = entries
    .map((e) => (isHarnessEntry(e) ? undefined : e.group))
    .find((g): g is number => typeof g === 'number');
  const group = authoredGroup ?? Math.max(0, ...managers.tab.tabs.map((t) => t.group)) + 1;

  const skipped: string[] = [];
  const notes: string[] = [];
  const toOpen = closeMatchingTabs(entries, managers, issuingLabel, skipped, notes);

  const used = new Set(managers.tab.tabs.map((t) => t.dotColor));
  const opened: string[] = [];
  let groupColor: string | undefined;
  const firstNew = managers.tab.tabs.length;
  const issuingCwd = managers.tab.cwdOf(issuingLabel) ?? process.cwd();

  for (const entry of toOpen) {
    const label = labelOf(entry);
    const dotColor = distinctColor(used, entry.dotColor);
    used.add(dotColor);
    groupColor ??= dotColor;
    if (isHarnessEntry(entry)) {
      const error = openHarnessEntry(entry, managers, group, groupColor, issuingCwd, notes);
      if (error) { skipped.push(`${label} (${error})`); continue; }
    } else {
      openAgentEntry(entry, managers, group, groupColor, dotColor);
    }
    opened.push(label);
  }

  if (opened.length > 0) managers.tab.setActiveTab(firstNew);
  const parts: string[] = [];
  if (opened.length > 0) parts.push(`Launched profile "${name}": ${opened.join(', ')}.`);
  if (notes.length > 0) parts.push(notes.join(' '));
  if (skipped.length > 0) parts.push(`Skipped: ${skipped.join('; ')}.`);
  out(parts.length > 0 ? parts.join(' ') : `Profile "${name}" has no agents to open.`);
}
