// The launcher's shared contract: the payload shape, the intent shapes, and the guards both sides
// check against. It imports nothing, because the client reaches it from inside the launcher's own
// lazy chunk and a contract that reached the host's module graph would drag it in. The one predicate
// below is the reason: it is three lines, and borrowing them from `src/plugins/api.ts` would cost the
// whole of `api.ts`.

export const LAUNCHER_PAYLOAD_SCHEMA_VERSION = 1;

// Whether a decoded value is a JSON object rather than a scalar or an array. Written out here rather
// than imported for the reason above, and kept in step with `src/value-guards.ts` by the contract's
// own tests.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The instance key the launcher's singleton tab is addressed by. One key because there is one
// launcher: `openOrFocusTab` focuses what is already there, and `updateTab` and `dockTab` address it.
export const LAUNCHER_INSTANCE_KEY = 'launcher';

// The launcher tab's label and the name it opens under.
export const LAUNCHER_LABEL = 'launcher';

// Whether an activity entry is one of the launcher's own tabs. Asked by the key the tab was opened
// under rather than by its label, because a label is the host's to mint and not the launcher's to
// reserve: `uniquePluginLabel` hands the launcher `launcher-2` when anything else holds `launcher`, and
// a shell the user named `launcher` is not the launcher's tab at all. A plugin tab is the only kind
// this can be, and the instance key is the one piece of a tab's identity the launcher already holds.
//
// One predicate because both the pull and the push path need it: the rows a flush reads and the rows
// the `tabs` topic delivers are the same rows, and two rules would drift.
export function isLauncherOwn(tab: { label: string; plugin?: { id: string; instanceKey: string } }): boolean {
  return tab.plugin?.instanceKey === LAUNCHER_INSTANCE_KEY;
}

// How long the launcher's client waits between summarizer flushes. It lives in the shared contract
// rather than in either side's own module because the client owns the interval and the server owns the
// prompt it paces, and the two must agree about the number. It mirrors the monitor's flush cycle: one
// cheap prompt every 30 seconds is the cadence an ACP-backed summary can afford.
export const SUMMARIZER_FLUSH_MS = 30_000;

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
  // The tab's own dot colour, so the row matches its strip entry.
  dotColor: string;
  // Whether this is the tab the host names as active. A position in the rail rather than a property of
  // the tab, which is why the host answers it and this view never derives it.
  active: boolean;
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

// A glyph the client's own build cannot draw, named back to the host so it can be reported once. The
// icon set is the client's, so the client is the only side that can tell — this is how it says so.
export type LauncherReportIconIntent = { icon: string };

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
    && typeof value.dotColor === 'string' && value.dotColor.length > 0
    && typeof value.active === 'boolean'
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

export function isReportIconIntent(value: unknown): value is LauncherReportIconIntent {
  return isRecord(value) && typeof value.icon === 'string' && value.icon.length > 0;
}

export function isFocusTabIntent(value: unknown): value is LauncherFocusTabIntent {
  return isRecord(value) && typeof value.label === 'string' && value.label.length > 0;
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}
