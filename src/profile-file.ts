import { existsSync, readFileSync } from 'node:fs';
import { collectProfileProblems } from './profile-schema.js';
import { profilePath } from './profiles.js';
import type {
  AgentState, LoadedProfile, ProfileAgentFile, ProfileEntry, ProfileFile, ProfileHarnessEntry,
  ProfileHarnessFile, ProfileLayout, ProfileLayoutFile, ProfileMonitor, ProfileMonitorFile,
} from './types.js';

// The single-file profile loader: read `profiles/<name>.json` once, validate the whole structure
// up front (all-or-nothing per the plan's Decision 6), and return a `LoadedProfile` carrying the
// ordered entries plus every reserved section — already mapped from the on-disk `tab`/`sidebar`
// shapes down to the flat runtime fields. Any structural fault returns `{ error }`, which the
// launcher maps to the terse "malformed" message.

// Map an on-disk agent element to the flat runtime `AgentState`: `tab.*` → the flat tab fields.
function mapAgent(file: ProfileAgentFile): AgentState {
  const { tab, ...rest } = file;
  return { ...rest, dotColor: tab?.color ?? '', number: tab?.number, focus: tab?.focus, group: tab?.group, groupColor: tab?.groupColor };
}

// Map an on-disk harness element to the flat runtime `ProfileHarnessEntry` (which keeps `type`,
// `name`, and the flat tab fields).
function mapHarness(file: ProfileHarnessFile): ProfileHarnessEntry {
  const { tab, ...rest } = file;
  return { ...rest, dotColor: tab?.color, number: tab?.number, focus: tab?.focus, group: tab?.group };
}

// An on-disk monitor's `name` defaults to its persona when omitted (Decision 13).
function mapMonitor(file: ProfileMonitorFile): ProfileMonitor {
  return { name: file.name ?? file.persona, persona: file.persona, targets: file.targets };
}

// Map the on-disk `layout` (nested `sidebar`) down to the flat internal `ProfileLayout`.
function mapLayout(file: ProfileLayoutFile): ProfileLayout {
  const layout: ProfileLayout = {};
  if (file.window) layout.window = file.window;
  if (typeof file.sidebar?.left === 'number') layout.sidebarLeft = file.sidebar.left;
  if (typeof file.sidebar?.right === 'number') layout.sidebarRight = file.sidebar.right;
  if (typeof file.tabAreaPct === 'number') layout.tabAreaPct = file.tabAreaPct;
  return layout;
}

// Combine the two typed arrays into one entry list, ordered by `number` (files without a number
// keep their append order), mirroring the old per-file loader's sort.
function mapEntries(file: ProfileFile): ProfileEntry[] {
  const entries: ProfileEntry[] = [
    ...(file.agents ?? []).map((agent) => mapAgent(agent)),
    ...(file.harnesses ?? []).map((harness) => mapHarness(harness)),
  ];
  return entries.toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
}

export function loadProfile(name: string): LoadedProfile | { error: string } {
  const filePath = profilePath(name);
  if (!existsSync(filePath)) return { error: `Profile file not found: ${filePath}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return { error: 'not valid JSON' };
  }
  const problems = collectProfileProblems(parsed);
  if (problems.length > 0) return { error: problems[0] };
  const file = parsed as ProfileFile;
  return {
    entries: mapEntries(file),
    monitors: (file.monitors ?? []).map((monitor) => mapMonitor(monitor)),
    files: file.files ?? [],
    editors: file.editors ?? [],
    notifications: file.notifications ?? [],
    schedules: file.schedules ?? [],
    layout: file.layout ? mapLayout(file.layout) : null,
  };
}
