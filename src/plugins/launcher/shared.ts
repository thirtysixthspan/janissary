import { isRecord } from '../api.js';

export const LAUNCHER_PAYLOAD_SCHEMA_VERSION = 1;

// The instance key the launcher's singleton tab is addressed by. One key because there is one
// launcher: `openOrFocusTab` focuses what is already there, and `updateTab` and `dockTab` address it.
export const LAUNCHER_INSTANCE_KEY = 'launcher';

// The launcher tab's label and the name it opens under.
export const LAUNCHER_LABEL = 'launcher';

// One row of the command rail: a glyph, the user's own wording, and the application command line
// clicking it dispatches. The label is the user's, not derived — two projects call the same command
// different things, and the rail is what a user reads.
export type LauncherCommand = {
  id: string;
  icon: string;
  label: string;
  command: string;
};

// One row of the tab list. A lean projection of the host's `TabActivityEntry`, carrying only what the
// row draws and what the hover card adds — so the transcript content a summarizer reads never reaches
// the wire. `summaries` is keyed by label and travels in the payload's own field, not per row.
export type LauncherTabRow = {
  label: string;
  title?: string;
  view?: 'plugin' | 'harness' | 'editor' | 'monitor' | 'files' | 'notifications';
  dock?: 'left' | 'right';
  pane?: 'right';
  busy: boolean;
  hasUnread: boolean;
  needsInput: boolean;
  lastActivity: number;
  cwd: string;
  remote?: string;
  lastCommand?: string;
};

// Where launcher.json was read from, so the Configure button can open exactly what is in effect and
// so the rail can say so when a file was rejected. `home` means the user's own file is replacing the
// project's.
export type LauncherSource = 'project' | 'home' | 'default';

export type LauncherPayload = {
  commands: LauncherCommand[];
  tabs: LauncherTabRow[];
  // The ACP-written status paragraph for each tab, keyed by label. A tab with none is simply absent
  // from the map rather than carrying an empty string, so a row with nothing to say shows no line
  // rather than an empty one.
  summaries: Record<string, string>;
  source: LauncherSource;
  // The absolute path of the file in effect, which the Configure button dispatches `edit` on.
  filePath: string;
  // Set when the effective file was unreadable, invalid, or held a malformed entry. The rail treats
  // every other field as the default set and reports the reason once through the notifications feed,
  // so this is the record that it has already said so.
  problem?: string;
};

// The command rail is a client-rendered list the client dispatches against, so a click is an intent
// carrying the entry's id. The server resolves the id back to the command line it read from the
// file, which means a client cannot name a line the file did not hold.
export type LauncherRunCommandIntent = { id: string };

// A line typed into the launcher's own command bar. Answered with `{ dispatched, output }` — the same
// pair `dispatchLineWithOutput` gives — so the rail can show the answer rather than leaving the bar
// silent about what ran.
export type LauncherDispatchIntent = { line: string };
export type LauncherDispatchReply = { dispatched: boolean; output: string; coreResponse?: boolean };

// The Configure button's click. Answered as a run-command intent carrying this one id, so the client
// has no second intent shape to remember.
export const CONFIGURE_INTENT_ID = 'configure';

// Focus a tab in the center strip, by the label the host already delivered in the payload.
export type LauncherFocusTabIntent = { label: string };

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isCommand(value: unknown): value is LauncherCommand {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.icon === 'string' && value.icon.length > 0
    && typeof value.label === 'string' && value.label.length > 0
    && typeof value.command === 'string' && value.command.trim().length > 0;
}

const VIEWS = new Set<string>(['plugin', 'harness', 'editor', 'monitor', 'files', 'notifications']);
const DOCKS = new Set<string>(['left', 'right']);

function isRow(value: unknown): value is LauncherTabRow {
  return isRecord(value)
    && typeof value.label === 'string' && value.label.length > 0
    && isOptionalString(value.title)
    && (value.view === undefined || (typeof value.view === 'string' && VIEWS.has(value.view)))
    && (value.dock === undefined || (typeof value.dock === 'string' && DOCKS.has(value.dock)))
    && (value.pane === undefined || value.pane === 'right')
    && typeof value.busy === 'boolean'
    && typeof value.hasUnread === 'boolean'
    && typeof value.needsInput === 'boolean'
    && typeof value.lastActivity === 'number'
    && typeof value.cwd === 'string'
    && isOptionalString(value.remote)
    && isOptionalString(value.lastCommand);
}

function isSummaries(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

const SOURCES = new Set<string>(['project', 'home', 'default']);

export function isLauncherPayload(value: unknown): value is LauncherPayload {
  return isRecord(value)
    && Array.isArray(value.commands)
    && value.commands.every(isCommand)
    && Array.isArray(value.tabs)
    && value.tabs.every(isRow)
    && isSummaries(value.summaries)
    && typeof value.source === 'string' && SOURCES.has(value.source)
    && typeof value.filePath === 'string'
    && isOptionalString(value.problem);
}

export function isRunCommandIntent(value: unknown): value is LauncherRunCommandIntent {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0;
}

export function isDispatchIntent(value: unknown): value is LauncherDispatchIntent {
  return isRecord(value) && typeof value.line === 'string' && value.line.length > 0;
}

export function isFocusTabIntent(value: unknown): value is LauncherFocusTabIntent {
  return isRecord(value) && typeof value.label === 'string' && value.label.length > 0;
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}
