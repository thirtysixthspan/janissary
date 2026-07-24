import type { AgentState } from '../agent/types.js';

// A profile entry describing a harness tab instead of an agent (discriminated by the presence of
// `type`). This is the runtime shape the openers consume — the loader maps a `harnesses` array
// element (`ProfileHarnessFile`) down to it. `schedule` entries are authored strings in the
// `schedule` command grammar (minus `in <tab>`); `run` entries are commands typed into the harness
// once, shortly after launch.
export type ProfileHarnessEntry = {
  // The tab label — the `name` field of the `harnesses` array element, same as an agent entry's
  // `name`. Every entry carries its own label since array elements have no filename to derive it from.
  name: string;
  // Which harness binary to launch (`claude`, `opencode`, `codex`).
  type: string;
  model?: string;
  // A startup effort level (e.g. "high"), passed through to the harness binary verbatim with no
  // validation against a fixed set (unlike `model`, which is checked against harness-models.json).
  effort?: string;
  number?: number;
  focus?: boolean;
  group?: number;
  dotColor?: string;
  workspace?: boolean;
  // `-y`/`--yes`: auto-approve the harness's own permission prompts. Supported for claude and codex
  // (mirrors `parseHarnessCommand`); an entry that sets it for an unsupported harness (opencode) is
  // reported and skipped at launch rather than opened unsafely. Works with or without `workspace`.
  autoApprove?: boolean;
  // `--offline`: adds a network-deny rule to the tab's sandbox profile (only meaningful with
  // `workspace`).
  offline?: boolean;
  cwd?: string;
  run?: string[];
  schedule?: string[];
};

export type ProfileEntry = AgentState | ProfileHarnessEntry;

// On-disk tab presentation for a profile entry (both `agents` and `harnesses` elements): the dot
// color, tab order, group, and group color, grouped under a `tab` object. The loader maps these down
// to the flat `dotColor`/`number`/`group`/`groupColor` fields of the runtime `AgentState` /
// `ProfileHarnessEntry`, and the saver maps them back up.
export type ProfileTab = { color?: string; number?: number; focus?: boolean; group?: number; groupColor?: string };

// An `agents` array element as authored/saved on disk: the agent-state fields, minus the flat tab
// fields (which live nested under `tab`).
export type ProfileAgentFile = Omit<AgentState, 'dotColor' | 'number' | 'group' | 'groupColor'> & {
  tab?: ProfileTab;
};

// A `harnesses` array element as authored/saved on disk: the runtime harness fields, minus the flat
// tab fields (which live nested under `tab`).
export type ProfileHarnessFile = Omit<ProfileHarnessEntry, 'dotColor' | 'number' | 'group'> & {
  tab?: ProfileTab;
};

// A profile-level monitor, authored under a profile's `monitors` key (decoupled from any single
// entry). Once every profile entry is open, each is started from the launch's issuing tab as
// `monitor <persona> <targets…>`. `name` is the monitor's runtime identity, distinct from `persona`:
// two monitors may share a persona yet coexist under different names, and a relaunch refreshes the
// one whose owner+name matches. `targets` are authored target words in the `monitor` grammar
// (`group:<n>` or a tab label); an empty list is inline mode.
export type ProfileMonitor = { name: string; persona: string; targets: string[] };

// A `monitors` array element as authored/saved on disk: `name` is optional and defaults to the
// persona when omitted (preserving the one-monitor-per-persona default).
export type ProfileMonitorFile = { name?: string; persona: string; targets: string[] };

// A profile-level file navigator tab, authored under a profile's `files` key. `dock` docks it into that
// sidebar; `in` roots it at the cwd of the named tab instead of the profile's first newly opened
// tab; `path` roots it at a literal path, expanded like the `files` command's path argument (so
// `$root` roots it at the launch dir regardless of any tab).
export type ProfileFilesEntry = { dock?: 'left' | 'right'; in?: string; path?: string };

// A profile-level editor tab. Its path resolves from `in`, or the profile's first newly opened
// tab, using the same rules as the `edit` command.
export type ProfileEditorsEntry = { path: string; in?: string; line?: number; tab?: ProfileTab };

// A profile-level notifications tab, authored under a profile's `notifications` key. `dock` docks
// the singleton notifications feed into that sidebar; `focus` (only meaningful alongside `dock`)
// makes it the visible tab in that sidebar's internal tab-switcher, overriding the default "most
// recently docked tab wins" behavior.
export type ProfileNotificationsEntry = { dock?: 'left' | 'right'; focus?: boolean };

// A profile-level schedules tab, authored under a profile's `schedules` key. `dock` docks the
// singleton schedules list into that sidebar.
export type ProfileSchedulesEntry = { dock?: 'left' | 'right' };

// Profile-level layout sizing, kept flat internally (the wire path threads these fields directly).
// Applied on every `profile launch`, including relaunch; any field it omits resets to the app's
// built-in default rather than being left at whatever it currently is.
export type ProfileLayout = {
  window?: { width: number; height: number };
  sidebarLeft?: number;
  sidebarRight?: number;
  tabAreaPct?: number;
};

// The on-disk layout shape under a profile's `layout` key: the left/right sidebar widths grouped
// under a nested `sidebar` object, parallel to `window`. The loader maps this down to the flat
// `ProfileLayout`, and the saver maps it back up.
export type ProfileLayoutFile = {
  sidebar?: { left?: number; right?: number };
  window?: { width: number; height: number };
  tabAreaPct?: number;
};

// The whole `profiles/<name>.json` file: an `agents` array and a `harnesses` array of entries, plus
// plain profile-level config keys. Unrecognized top-level keys are ignored (a reserved namespace).
export type ProfileFile = {
  agents?: ProfileAgentFile[];
  harnesses?: ProfileHarnessFile[];
  monitors?: ProfileMonitorFile[];
  files?: ProfileFilesEntry[];
  editors?: ProfileEditorsEntry[];
  notifications?: ProfileNotificationsEntry[];
  schedules?: ProfileSchedulesEntry[];
  layout?: ProfileLayoutFile;
};

// The loader's structured result: the ordered entries plus every reserved section, parsed and
// validated once up front from the single profile file.
export type LoadedProfile = {
  entries: ProfileEntry[];
  monitors: ProfileMonitor[];
  files: ProfileFilesEntry[];
  editors: ProfileEditorsEntry[];
  notifications: ProfileNotificationsEntry[];
  schedules: ProfileSchedulesEntry[];
  layout: ProfileLayout | null;
};

export type ProfileParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'launch'; name: string }
  | { action: 'save'; name: string }
  | { action: 'validate'; name?: string };
