// A handler that splices picked text, such as a task, into one tab's command bar at its caret.
export type CommandLineInsertion = (text: string) => void;

// What the app shell provides once for every plugin body below it. It holds the application-wide
// answers — which tab the queue popup is open over, each tab's own command queue — and is never handed
// to a plugin as it stands: `scopeAppCommandBar` narrows it to the one tab a body renders in first.
export type AppCommandBarState = {
  // `sourceVisible` is false when the source tab's body is not on screen, which opens no picker.
  intercept(line: string, sourceTab?: string, sourceVisible?: boolean): boolean;
  ghostHistory: string[];
  blockingOverlayOpen?: boolean;
  overlayOwnsCommandBar?: boolean;
  onFocusTab?: (label: string | undefined) => void;
  // The tab the queue popup belongs to. The popup's state below reaches that tab alone.
  queueTab?: string;
  queueOpen?: boolean;
  queueIndex?: number;
  queueItems?: readonly string[];
  onEditQueued?: (text: string) => void;
  onDeleteQueued?: () => void;
  queuedLinesOf?: (label: string) => readonly string[] | undefined;
  registerCommandLineInsertion?: (label: string, handler: CommandLineInsertion) => () => void;
};

// The one question a plugin tab's command bar asks the application before it offers a line onward:
// would the application's own bar have handled this instead of sending it? Answered with the same
// classification the agent tab's chain uses, so a bare word opens the same picker, and `quit` — or a
// `close` that would take the last tab with it — opens the same confirmation, from either bar.
//
// Everything here is already bound to the tab the body renders in. The queue popup's fields describe
// a popup open over this tab, and read closed and empty while it is open over any other.
// `queuedLines` is this tab's own command queue as the server last broadcast it, which is how a tab
// learns that another tab queued a line for it.
export type AppCommandBar = {
  intercept(line: string): boolean;
  ghostHistory: string[];
  blockingOverlayOpen: boolean;
  overlayOwnsCommandBar: boolean;
  onFocusChange(focused: boolean): void;
  queueOpen: boolean;
  queueIndex: number;
  queueItems: readonly string[];
  onEditQueued?: (text: string) => void;
  onDeleteQueued?: () => void;
  queuedLines: readonly string[];
  // Registers where a picked line lands in this tab's bar. Returns the matching unregister.
  registerCommandLineInsertion(handler: CommandLineInsertion): () => void;
};

const NO_LINES: readonly string[] = [];

// The application's command-bar state as one tab sees it. Every label is bound here rather than taken
// from the caller, so a plugin body cannot run a line as another tab, report another tab as focused,
// or edit a queue popup that is open over a different tab. The popup's state reaches only the tab it
// belongs to; every other tab sees it closed and empty, which is what keeps one popup from rewriting
// every mounted bar. `active` is whether the body is on screen, which the host knows and the
// application does not: a line from a hidden body is classified the same way but opens no picker.
export function scopeAppCommandBar(
  state: AppCommandBarState,
  label: string,
  registerCommandLineInsertion: AppCommandBar['registerCommandLineInsertion'],
  active = true,
): AppCommandBar {
  const ownsQueue = state.queueTab === label;
  return {
    intercept: (line) => state.intercept(line, label, active),
    ghostHistory: state.ghostHistory,
    blockingOverlayOpen: state.blockingOverlayOpen === true,
    overlayOwnsCommandBar: state.overlayOwnsCommandBar === true,
    onFocusChange: (focused) => { state.onFocusTab?.(focused ? label : undefined); },
    queueOpen: ownsQueue && state.queueOpen === true,
    queueIndex: ownsQueue ? state.queueIndex ?? 0 : 0,
    queueItems: ownsQueue ? state.queueItems ?? NO_LINES : NO_LINES,
    onEditQueued: ownsQueue ? state.onEditQueued : undefined,
    onDeleteQueued: ownsQueue ? state.onDeleteQueued : undefined,
    queuedLines: state.queuedLinesOf?.(label) ?? NO_LINES,
    registerCommandLineInsertion,
  };
}

// Adds one tab's insertion handler to the map the task picker reads. The returned unregister removes
// that handler only, so a remount that registered a newer one for the same tab keeps it.
export function registerCommandLineInsertion(
  insertions: Map<string, CommandLineInsertion>,
  label: string,
  handler: CommandLineInsertion,
): () => void {
  insertions.set(label, handler);
  return () => {
    if (insertions.get(label) === handler) insertions.delete(label);
  };
}
