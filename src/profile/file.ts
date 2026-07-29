import { existsSync, readFileSync } from 'node:fs';
import { collectProfileProblems } from './schema.js';
import { profileReadPath } from '../profiles.js';
import type {
  LoadedProfile, ProfileFile, ProfileLayout, ProfileLayoutFile, ProfileMonitor, ProfileMonitorFile,
  ProfileTabFile, ProfileTabPresentation, ProfileTabRuntime,
} from '../types.js';

// The single-file profile loader: read `profiles/<name>.json` once, validate the whole structure
// up front (all-or-nothing per the plan's Decision 6), and return a `LoadedProfile` carrying the
// `tabs` array partitioned into the per-kind lists each opener consumes — already mapped from the
// on-disk `color`/`sidebar` names down to the flat runtime fields. Any structural fault returns
// `{ error }`, which the launcher maps to the terse "malformed" message.

type PartitionedTabs = Pick<LoadedProfile, 'entries' | 'files' | 'editors' | 'notifications' | 'schedules' | 'views'>;

// The on-disk `color` is the runtime `dotColor`; every other presentation field keeps its name.
function presentation(tab: ProfileTabPresentation): ProfileTabRuntime {
  return {
    dotColor: tab.color, number: tab.number, focus: tab.focus,
    group: tab.group, groupColor: tab.groupColor, pane: tab.pane,
  };
}

// Drop the two keys that exist only on disk — the `type` discriminator and `color` (re-supplied as
// `dotColor` by `presentation`) — leaving every other field of the element as authored.
function stripFileKeys<T extends { type: string }>(tab: T): Omit<T, 'type' | 'color'> {
  const rest: Record<string, unknown> = { ...tab };
  delete rest.type;
  delete rest.color;
  return rest as Omit<T, 'type' | 'color'>;
}

// Route each `tabs` element into the runtime list its opener reads, by its `type`. Agent and
// harness elements share the ordered `entries` list, which is sorted by `number` (an entry without
// one sorting last, and two unnumbered entries keeping their array order — the comparator returns
// NaN for that pair, which a stable sort leaves in place).
function partitionTabs(tabs: ProfileTabFile[]): PartitionedTabs {
  const out: PartitionedTabs = { entries: [], files: [], editors: [], notifications: [], schedules: [], views: [] };
  for (const tab of tabs) {
    switch (tab.type) {
    case 'agent': {
      out.entries.push({ ...stripFileKeys(tab), ...presentation(tab), dotColor: tab.color ?? '' });
      break;
    }
    case 'harness': { out.entries.push({ ...stripFileKeys(tab), ...presentation(tab) }); break; }
    case 'editor': { out.editors.push({ ...stripFileKeys(tab), ...presentation(tab) }); break; }
    case 'files': { out.files.push({ ...stripFileKeys(tab), ...presentation(tab) }); break; }
    case 'notifications': { out.notifications.push(stripFileKeys(tab)); break; }
    case 'schedules': { out.schedules.push(stripFileKeys(tab)); break; }
    case 'page': { out.views.push({ ...presentation(tab), type: 'page', url: tab.url }); break; }
    case 'ssh': {
      out.views.push({ ...presentation(tab), type: 'ssh', destination: tab.destination, options: tab.options });
      break;
    }
    default: { out.views.push({ ...presentation(tab), type: tab.type, path: tab.path }); }
    }
  }
  out.entries = out.entries.toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  return out;
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

export function loadProfile(name: string): LoadedProfile | { error: string } {
  const filePath = profileReadPath(name);
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
    ...partitionTabs(file.tabs ?? []),
    monitors: (file.monitors ?? []).map((monitor) => mapMonitor(monitor)),
    layout: file.layout ? mapLayout(file.layout) : null,
  };
}
