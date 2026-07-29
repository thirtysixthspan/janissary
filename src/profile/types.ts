import type { AgentState } from '../agent/types.js';
import type { CenterPane } from '../tab/types.js';

export type ProfileRow = { name: string; source: 'project' | 'janissary' };

// The flat tab presentation carried by every runtime entry that produces a main-area tab: the dot
// color, tab order, group, group color, pane, and focus. The on-disk form is the same shape with
// `dotColor` spelled `color` (see ProfileTabPresentation) — the loader's one remaining rename.
export type ProfileTabRuntime = {
  dotColor?: string;
  number?: number;
  focus?: boolean;
  group?: number;
  groupColor?: string;
  pane?: CenterPane;
};

// A profile entry describing a harness tab instead of an agent (discriminated by the presence of
// `tool`). This is the runtime shape the openers consume — the loader maps a `harness` element of
// the `tabs` array down to it. `schedule` entries are authored strings in the `schedule` command
// grammar (minus `in <tab>`); `run` entries are commands typed into the harness once, shortly
// after launch.
export type ProfileHarnessEntry = ProfileTabRuntime & {
  // The tab label — the `name` field of the `harness` element, same as an agent entry's `name`.
  // Every entry carries its own label since array elements have no filename to derive it from.
  name: string;
  // Which harness binary to launch (`claude`, `opencode`, `codex`). Named `tool` rather than
  // `type`, which the `tabs` array uses for its own kind discriminator.
  tool: string;
  model?: string;
  // A startup effort level (e.g. "high"), passed through to the harness binary verbatim with no
  // validation against a fixed set (unlike `model`, which is checked against harness-models.json).
  effort?: string;
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

export type ProfileAgentEntry = AgentState & { pane?: CenterPane };
export type ProfileEntry = ProfileAgentEntry | ProfileHarnessEntry;

// On-disk tab presentation, flat on the entry itself alongside its `type`. `color` is the on-disk
// name of the runtime `dotColor`; every other field keeps its name.
export type ProfileTabPresentation = {
  color?: string;
  number?: number;
  focus?: boolean;
  group?: number;
  groupColor?: string;
  pane?: CenterPane;
};

// A profile-level file navigator tab. `dock` docks it into that sidebar; `in` roots it at the cwd
// of the named tab instead of the profile's first newly opened tab; `path` roots it at a literal
// path, expanded like the `files` command's path argument (so `$root` roots it at the launch dir
// regardless of any tab).
export type ProfileFilesEntry = { dock?: 'left' | 'right'; in?: string; path?: string };

// A profile-level editor tab. Its path resolves from `in`, or the profile's first newly opened
// tab, using the same rules as the `edit` command.
export type ProfileEditorsEntry = ProfileTabRuntime & { path: string; in?: string; line?: number };

// A profile-level notifications tab. `dock` docks the singleton notifications feed into that
// sidebar; `focus` (only meaningful alongside `dock`) makes it the visible tab in that sidebar's
// internal tab-switcher, overriding the default "most recently docked tab wins" behavior.
export type ProfileNotificationsEntry = { dock?: 'left' | 'right'; focus?: boolean };

// A profile-level schedules tab. `dock` docks the singleton schedules list into that sidebar.
export type ProfileSchedulesEntry = { dock?: 'left' | 'right' };

// A profile-level view tab — an image, markdown viewer, web page, or ssh session. None of these
// authors a label: the tab's name is derived at open time exactly as the `open`/`ssh` commands
// derive it, so a relaunch is matched against an open tab by identity (path, url, destination)
// rather than by label.
export type ProfileViewEntry = ProfileTabRuntime & (
  | { type: 'image'; path: string }
  | { type: 'markdown'; path: string }
  | { type: 'page'; url: string }
  | { type: 'ssh'; destination: string; options?: string[] }
);

export type ProfileAgentTabFile = { type: 'agent' }
  & Omit<ProfileAgentEntry, keyof ProfileTabRuntime> & ProfileTabPresentation;

export type ProfileHarnessTabFile = { type: 'harness' }
  & Omit<ProfileHarnessEntry, keyof ProfileTabRuntime> & ProfileTabPresentation;

export type ProfileEditorTabFile = { type: 'editor'; path: string; in?: string; line?: number }
  & ProfileTabPresentation;

export type ProfileFilesTabFile = { type: 'files' } & ProfileFilesEntry;
export type ProfileNotificationsTabFile = { type: 'notifications' } & ProfileNotificationsEntry;
export type ProfileSchedulesTabFile = { type: 'schedules' } & ProfileSchedulesEntry;

export type ProfileImageTabFile = { type: 'image'; path: string } & ProfileTabPresentation;
export type ProfileMarkdownTabFile = { type: 'markdown'; path: string } & ProfileTabPresentation;
export type ProfilePageTabFile = { type: 'page'; url: string } & ProfileTabPresentation;
export type ProfileSshTabFile = { type: 'ssh'; destination: string; options?: string[] }
  & ProfileTabPresentation;

// One element of a profile's `tabs` array: every kind of tab a profile can open, discriminated by
// its root-level `type`. Array position breaks ties between equal (or absent) `number` values; it
// is not itself the launch order.
export type ProfileTabFile =
  | ProfileAgentTabFile
  | ProfileHarnessTabFile
  | ProfileEditorTabFile
  | ProfileFilesTabFile
  | ProfileNotificationsTabFile
  | ProfileSchedulesTabFile
  | ProfileImageTabFile
  | ProfileMarkdownTabFile
  | ProfilePageTabFile
  | ProfileSshTabFile;

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

// The whole `profiles/<name>.json` file: one ordered `tabs` array holding every tab the profile
// opens, plus the two profile-level keys that are not tabs. Unrecognized top-level keys are ignored
// (a reserved namespace), which is also what becomes of a file still using the old per-kind keys.
export type ProfileFile = {
  tabs?: ProfileTabFile[];
  monitors?: ProfileMonitorFile[];
  layout?: ProfileLayoutFile;
};

// The loader's structured result: the `tabs` array partitioned into the per-kind lists each opener
// module consumes, parsed and validated once up front from the single profile file.
export type LoadedProfile = {
  entries: ProfileEntry[];
  monitors: ProfileMonitor[];
  files: ProfileFilesEntry[];
  editors: ProfileEditorsEntry[];
  notifications: ProfileNotificationsEntry[];
  schedules: ProfileSchedulesEntry[];
  views: ProfileViewEntry[];
  layout: ProfileLayout | null;
};

export type ProfileParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'launch'; name: string }
  | { action: 'save'; name: string }
  | { action: 'validate'; name?: string };
