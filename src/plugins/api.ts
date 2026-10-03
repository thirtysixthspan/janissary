import type {
  TabPluginNotification, TabPluginNotificationTopic, TabPluginTopicAction,
} from './api-topics.js';
import type { TabPluginCapabilityName } from './api-capabilities.js';
import type { CompletionResult } from '../completion/types.js';

// The capability half of the contract, and the topic half below it, live in modules of their own and
// are re-exported here, so a plugin still reads the whole v1 contract from one module.
export {
  TAB_PLUGIN_API_VERSION, TAB_PLUGIN_CAPABILITY_NAMES, isTabPluginCapability, TabPluginRejection,
} from './api-capabilities.js';
export type { TabPluginCapabilityName } from './api-capabilities.js';

export {
  TAB_PLUGIN_NOTIFICATION_TOPICS, isTabPluginNotificationTopic,
} from './api-topics.js';
export type {
  TabPluginNotification, TabPluginNotificationTopic, TabPluginTopicAction,
} from './api-topics.js';

export type TabPluginDeclaration = {
  id: string;
  version: string;
  apiVersion: number;
  payloadSchemaVersion: number;
  tabLabelPrefix: string;
  fileExtensions: Readonly<Record<string, string | undefined>>;
  // Claims the `open` command's web branch — a target carrying an http/https scheme, or preceded by
  // the `page` keyword. The host decides what looks like a web address; the plugin decides what one
  // means, so the claim carries no normalization. First claimant wins, exactly as for an extension.
  webTargets?: boolean;
  // Claims the `edit` command for the file types this plugin already claims, so `edit photo.png`
  // reaches the plugin's own editing presentation instead of the plain-text editor. A declaration
  // carrying it must supply an `edit` opener presentation.
  editsOwnFiles?: boolean;
  editGesture?: 'open external';
  command?: string;
  // Every extension in `fileExtensions` is something to play rather than merely to open, which is
  // what the `play` command asks before dispatching a file to this plugin's inline opener. A flag
  // rather than a list of its own, so the playable types cannot drift from the claimed ones: a
  // plugin claims what it owns once and says of that set whether any of it plays.
  playable?: boolean;
  // Asks for the `spawnTerminal` resource: the right to start a process from a payload factory, in
  // any directory the plugin names. A flag rather than a capability entry because the terminal cannot
  // be started as one — a tab's label does not exist until its factory returns, so it is started there
  // and adopted onto the label afterwards — but starting a process is the most powerful thing a plugin
  // can ask for, and it belongs in the declaration a reader reviews rather than arriving ambient.
  // A workspace passed alongside it confines the process through Seatbelt exactly as that tab's own
  // shell is confined; without one it runs wherever the plugin said, like any other unconfined shell.
  spawnTerminal?: boolean;
  // Host topics this plugin wants to hear about. A declaration naming one must supply `notify`.
  notifications?: readonly TabPluginNotificationTopic[];
  // An entry the default context menu offers for a text selection. A declaration carrying one must
  // supply a `defaultMenuAction` handler.
  defaultMenu?: { label: string };
  // An entry the file navigator offers for a multi-row selection of this plugin's own file types.
  // A declaration carrying one must supply a `selectionAction` handler.
  selectionAction?: TabPluginSelectionAction;
  // Host state this plugin's tabs want pushed into their payloads: the connection list, the schedule
  // list, or both. A declaration naming any must supply a `hostState` handler. The host delivers a
  // named slice only when it differs from what it last pushed to that tab, so this is a change
  // signal rather than a subscription to every state broadcast.
  hostState?: readonly TabPluginHostStateSlice[];
  // Chords this plugin claims while one of its tabs is the visible one — canonical ids in the shape
  // the application's own chord table uses. A claimed chord runs the handler the mounted body
  // registers rather than the application's action, and reverts to the application the moment
  // another tab is focused. A claim no mounted body answers falls through unchanged.
  chords?: readonly string[];
  capabilities: readonly TabPluginCapabilityName[];
};

export type TabPluginHostStateSlice = 'connections' | 'schedule';

const HOST_STATE_SLICES = new Set<TabPluginHostStateSlice>(['connections', 'schedule']);

export function isTabPluginHostStateSlice(name: string): name is TabPluginHostStateSlice {
  return HOST_STATE_SLICES.has(name as TabPluginHostStateSlice);
}

export type TabPluginHostState = {
  // Addressed by instance key, because that is what `updateTab` takes — the handler's job is to merge
  // these rows into a payload, and merging needs the key it will be writing under.
  instanceKey: string;
  // What the tab currently holds, so a handler can merge rather than replace: the host hands over the
  // payload it is about to be asked to replace, and only the plugin knows which fields are its own.
  tabPayload: unknown;
  connections: unknown[];
  schedule: unknown[];
};

// A terminal this plugin's tab owns, spawned while its payload factory runs. The window is the same
// one `registerFile` is scoped to, which is what guarantees the caller has a tab to attach it to: a
// tab's label is allocated only after its factory returns.
export type TabPluginTerminal = {
  ptyId: string;
  cols: number;
  rows: number;
  // Whether it is still running. False once the process behind it has exited, which a tab cannot
  // learn any other way after a reconnect.
  running: boolean;
};

export type TabPluginTerminalOptions = {
  // Where the terminal starts. A workspaced tab's clone, or the project root.
  cwd: string;
  // The shell to run, and the argv to run it with. Omit `args` to run one command through the
  // shell; pass `[]` to run the shell itself, which is what a terminal a person types into wants.
  shell?: string;
  args?: string[];
  // Confinement for a terminal started in a workspace clone, mirroring the sandbox the tab's own
  // shell runs under. The plugin names where the terminal lives; the host owns how it is confined.
  workspace?: { dir: string; offline?: boolean };
};

export type TabPluginResources = {
  registerFile(absPath: string): string;
  // Start a terminal this tab will own. The host releases it when the tab closes, when the plugin is
  // disposed, and when the plugin is disabled — the plugin never holds a process handle, so there is
  // nothing for it to leak. Callable only from inside a payload factory.
  spawnTerminal(options: TabPluginTerminalOptions): TabPluginTerminal;
};

export type TabPluginPayload = {
  title: string;
  payload: unknown;
};

// What an `updateTab` factory returns. Deliberately not `TabPluginPayload`: the title is optional
// here, because a plugin changing only what a tab shows must be able to leave the name in the tab
// strip alone.
export type TabPluginTabUpdate = {
  title?: string;
  // A new instance key, for a tab whose identity is what it shows and whose subject has moved — an
  // embedded page navigating to another address. Omit it and the key stays as it was. A key another
  // open tab of the same plugin already holds is refused; the payload still applies, so a plugin
  // never has to handle half an update.
  instanceKey?: string;
  payload: unknown;
};

// What a plugin contributes for a whole selection of file navigator rows. The navigator offers it
// only when every selected row is a file whose extension this one declaration claims, so a plugin
// never sees a path it does not own. Deliberately a label and an action name and nothing else: the
// plugin describes the entry, the host decides when it is offered and resolves the paths.
export type TabPluginSelectionAction = {
  label: string;
  action: string;
};

export type TabPluginServerCapabilities = {
  note(text: string): void;
  // Report one line to the notifications feed, attributed to the tab the plugin was invoked from.
  // Deliberately narrow: a plugin may say that something happened and may not choose the event type
  // or a tab to jump to. The one thing it may add is a file for the line to carry — the arrangement
  // an auto-approved permission prompt's screen capture already uses, and the only way a plugin can
  // offer something too long to read in place. The line is dropped when no notifications feed is
  // open, exactly as every other event is — plugin activity never conjures the feed into existence.
  //
  // `tab` attributes the line to one of this plugin's own tabs instead, addressed by instance key like
  // `updateTab`. It is how a line said from a `notify` handler — which has no invoking tab — names the
  // tab it is about. A key with no open tab of this plugin's falls back to the invoking tab, so a
  // plugin can never attribute a line to a tab it does not own.
  notifyUser(text: string, options?: { openFile?: string; tab?: string }): void;
  openOrFocusTab(instanceKey: string, factory: (resources: TabPluginResources) => TabPluginPayload): void;
  // Replace what one of this plugin's own tabs shows, addressed by the instance key it was opened
  // with. The tab keeps its label, position, group, focus, instance key, schema version, and the
  // files it is already serving; only the payload, and the title when the factory returns one,
  // change. An instance key this plugin has no open tab for is a no-op, so a plugin never has to
  // track which of its tabs the user has since closed.
  //
  // The factory receives the same `TabPluginResources` the `openOrFocusTab` one does, so an update
  // may begin serving a file the tab did not hold before — a playlist gaining a track. Every
  // reference it registers is recorded against the tab being updated, so closing that tab releases
  // what the update served exactly as it releases what the open served.
  updateTab(instanceKey: string, factory: (resources: TabPluginResources) => TabPluginTabUpdate): void;
  // Dock one of this plugin's own tabs into a sidebar, or `null` to undock it back to the centre
  // strip and make it active. Addressed by instance key like `updateTab`, so a key with no open tab
  // is a silent no-op and a plugin can never move another plugin's tab.
  dockTab(instanceKey: string, dock: 'left' | 'right' | null): void;
  // Cache the text currently visible in one of this plugin's own tabs, so a monitor watching that
  // tab has something to feed on. The cache is server-only and is never broadcast to any client.
  // Addressed by instance key like `updateTab`, so a key with no open tab is a silent no-op and a
  // plugin can never write another plugin's snapshot.
  snapshotTab(instanceKey: string, text: string): void;
  // The data a declared topic carries, as of now. A notification says a topic changed; this is how a
  // plugin building a tab for the first time learns what the topic currently holds. Asking for a
  // topic this plugin did not declare is a plugin-authoring mistake and disables it.
  topicData(topic: TabPluginNotificationTopic): TabPluginNotification['data'];
  // Ask the host to perform one of the actions a declared topic defines.
  topicAction(action: TabPluginTopicAction): void;
  // Ask the host to run its ordinary `open` pipeline for `target`, restricted to this plugin's own
  // claimed extensions. The host queues the request and runs it after the guarded call returns, so
  // glob expansion and per-file dispatch never count against the plugin's own call budget.
  openClaimedFiles(target: string): void;
  // The project's gitignore-aware file list as project-relative forward-slash paths, and the
  // directory they are relative to. The same list the `projectFiles` RPC serves to Quick Open, so a
  // plugin scanning the repository and a user picking a file see the same set. The root is returned
  // because a relative path cannot be opened without it.
  projectFileList(): Promise<{ root: string; paths: string[] }>;
  // Open a file in an editor tab with the cursor on `line`, through the ordinary `edit` pipeline: an
  // already-open file is focused rather than duplicated, the line is centered, and the file is
  // served by the authenticated `/open/<id>` allow-list like any other editor open. This is the
  // route for a plugin that must put a user on a specific line, which `openClaimedFiles` cannot
  // express — it is pinned to the plugin's own claimed extensions and takes no line.
  openInEditor(absPath: string, line: number): void;
  configuredViewer(): string;
  openExternally(absPath: string, application?: string): boolean;
  // This plugin's own remembered settings from `.janissary/config.json`, or `{}` when it has saved
  // none. Keyed by the plugin's id, so a plugin can read no other plugin's settings.
  readSettings(): Record<string, unknown>;
  // Replace this plugin's own remembered settings, answering whether the write succeeded. A value
  // that is not a plain JSON object is a plugin bug and disables the plugin rather than being saved.
  saveSettings(settings: Record<string, unknown>): boolean;
  // Whether a tab the user can see is recording this exact file right now. A question about host
  // state a plugin cannot answer for itself — it reaches no tab list — and the answer is not
  // derivable from the file: a recording ended by its tab closing carries no exit event, so nothing
  // in it distinguishes a finished session from a live one.
  isRecordingLive(absPath: string): boolean;
  // The tab a plugin command was invoked from: its label, where it is working, and the workspace
  // clone it runs in when it has one. A plugin's command handler is handed the argument and its
  // capabilities and nothing else, so this is the only way one learns what the user was standing in
  // when they asked for it. The host already resolves that tab for `note` and `openOrFocusTab`;
  // this makes the same resolution readable rather than new.
  originTab(): { label: string; cwd: string; workspace?: { dir: string; offline?: boolean } } | null;
  // Offer one line to the application's own command dispatcher, answering whether it ran. A line that
  // resolves to a command runs as that command in the tab this was called from; a line that resolves
  // to nothing is the caller's to handle. Deliberately one call rather than a resolve-then-decide
  // pair: the application's command table is consulted once, in the one place that owns it, and is
  // never copied into a plugin where a newly added command would be invisible.
  dispatchLine(line: string): boolean;
  // The completion the application's command bar shows for a line, for a plugin whose tab has one.
  completeLine(line: string, cursor: number): CompletionResult;
  // Whether a terminal this plugin spawned is still running. A client that reconnects learns nothing
  // about what happened while it was away: the exit event was broadcast to nobody, and a plugin tab
  // is in-memory only, so the tab is still there holding the payload of a shell that finished minutes
  // ago. This is how a tab learns that and closes rather than waiting for input that can never arrive.
  terminalRunning(ptyId: string): boolean;
  rejectRequest(reason: string): never;
  reportFailure(reason: unknown): never;
};

export type TabPluginOpener = {
  inline(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  external(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  // The `edit` presentation: the same file, opened for modification rather than for viewing.
  // Required only when the declaration sets `editsOwnFiles`.
  edit?(file: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
};

export type TabPluginPresentation = keyof TabPluginOpener;

// The plugin-facing shape of one tab-scoped intent. Deliberately its own type rather than the wire
// request, so widening `pluginIntent` on the socket never silently widens the plugin contract.
export type TabPluginIntent = {
  tab: string;
  intent: string;
  payload: unknown;
  tabPayload: unknown;
};

export type TabPluginActivation = {
  opener: TabPluginOpener;
  // Runs the plugin's declared command with everything after the first token. Required only when the
  // declaration claims a command name.
  command?(argument: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  // The result is sent to the waiting client, so it must be JSON-compatible. Unlike an opener or a
  // command, an intent may not fall off its last line: `undefined` is not JSON, so the host treats it
  // as an invalid produced result and disables the plugin. Return `null` when there is nothing to say.
  intent(request: TabPluginIntent, capabilities: TabPluginServerCapabilities): unknown | Promise<unknown>;
  // Called when a declared topic fires. Required only when the declaration names one. Its return
  // value is ignored — a notification reports that something happened and cannot influence any host
  // outcome; a plugin acts on it by calling `updateTab`.
  notify?(event: TabPluginNotification, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  // Runs the entry the declaration contributed for the default context menu. Required only when
  // the declaration carries one. `selection` is the plain text the menu was offered against.
  defaultMenuAction?(selection: string, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  // Runs the entry the declaration contributed for a file navigator selection. Required only when
  // the declaration carries one. `paths` are absolute and were resolved by the host against the
  // navigator's own root, so a client can never name a file outside the tree it is browsing.
  selectionAction?(
    paths: readonly string[], capabilities: TabPluginServerCapabilities,
  ): void | Promise<void>;
  // Called when host state this tab shows has changed. Required only when the declaration names a
  // `hostState` slice. Delivered only for a change, so a plugin building a tab reads its first
  // payload empty and waits for this rather than having to read host state it cannot reach. Its
  // return value is ignored for the same reason a notification's is: a status window cannot influence
  // any host outcome, and a plugin acts on it by calling `updateTab`.
  hostState?(state: TabPluginHostState, capabilities: TabPluginServerCapabilities): void | Promise<void>;
  isPayload(value: unknown): boolean;
  dispose?(): void | Promise<void>;
};

export type TabPluginActivationModule = {
  activate(): TabPluginActivation | Promise<TabPluginActivation>;
};

// The declared intent table lives beside the contract it completes; re-exported here so a plugin
// imports it from the same module as everything else in the contract.
export { defineIntents, type TabPluginIntentEntry } from './define-intents.js';

// The dockable-list command and notify pair, for the same reason and on the same terms as the intent
// table beside it: a plugin whose whole tab is one dockable list of records wrote both by hand.
export { defineDockableList, type DockableListOptions } from './define-list-tab.js';

// The `<command> [left|right]` grammar every dockable list plugin reads its argument with, and the
// opener pair a plugin that claims no files answers a stray file with — each published once so the
// wording a user sees has one owner rather than a copy per plugin.
export { parseDockArgument } from './dock-argument.js';
export { noFileOpener } from './no-file-opener.js';
// Which SQL statements come back as rows, published for the same reason the numbered-sibling writer
// is: the test itself is pure data, it already has two callers that must agree (`db sqlite query` and
// the database browser's console), and the import boundary would otherwise force one of them to
// re-derive it. Additive, so `TAB_PLUGIN_API_VERSION` does not move.
export { READ_QUERY } from '../database/query.js';

export type TabPluginLoader = () => Promise<TabPluginActivationModule>;
export type TabPluginLoaders = Readonly<Record<string, TabPluginLoader>>;

export type { PluginFailedRequest, PluginIntentRequest, PluginTabView } from '../protocol.js';
// The two guards a plugin payload decoder opens with, re-exported for the same reason the protocol
// types above are: a plugin cannot import `../value-guards.js` across the plugin import boundary, and
// every bundled plugin's `shared.ts` had its own copy of both.
export { isModelPair, isRecord } from '../value-guards.js';
// Re-exported so a plugin can type a `schedules` notification handler without importing
// `../protocol.js`, which the plugin import boundary forbids.
export type {
  AggregatedScheduleView,
  ConversationModelPair,
  ConversationSummaryView,
  ConversationTurnView,
  ConversationWindowView,
  ConversationsView,
  RemoteSessionAction,
  RemoteSessionKind,
  RemoteSessionState,
  RemoteSessionView,
} from '../protocol.js';
// The database-browser slice, re-exported for the same reason: a plugin reaches the SQLite registry
// only through the `databases` topic, and typing that topic's data and actions needs these.
export type {
  DatabaseCellView,
  DatabaseColumnView,
  DatabaseFilterOperator,
  ForeignKey,
  DatabaseFilterView,
  DatabaseGridQuery,
  DatabaseGridView,
  DatabaseObjectKind,
  DatabaseObjectView,
  DatabaseOrderView,
  DatabaseRefView,
  DatabaseResultView,
  DatabaseRowView,
  DatabasesView,
} from '../protocol.js';

// Resolution: core openers and commands resolve first, then one plugin contribution by exact
// extension or case-insensitive first token. Ordering: duplicate claims are rejected, so array
// position never breaks a tie. Async: each handler is awaited under its call budget and separate
// invocations may overlap. An empty return from an opener or a command means the handler completed
// without opening a tab; an intent must return a JSON-compatible value instead, since its result is
// sent to a waiting client. Failure: a `rejectRequest` throw answers one bad request; anything else
// disables the plugin.
