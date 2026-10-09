import { homedir } from 'node:os';
import { defineIntents, noFileOpener, parseDockArgument } from '../api.js';
import type { TabActivityEntry, TabPluginActivation, TabPluginNotification, TabPluginServerCapabilities } from '../api.js';
import {
  CONFIGURE_INTENT_ID,
  LAUNCHER_INSTANCE_KEY,
  LAUNCHER_LABEL,
  isDispatchIntent,
  isFocusTabIntent,
  isLauncherPayload,
  isRunCommandIntent,
  type LauncherDispatchIntent,
  type LauncherFocusTabIntent,
  type LauncherRunCommandIntent,
} from './shared.js';
import { readLauncherFile } from './commands-file.js';
import { readPersonaBody } from './persona.js';
import { createSummarizer } from './summarizer.js';
import { initialState, payloadOf, rowsChanged, toRows, type LauncherState } from './payload.js';

// There is one launcher for the life of the server, so its state is module state. The one thing that
// must be per-launcher rather than per-server is the summarizer's session, which stops the moment the
// launcher's tab closes.
const state: LauncherState = initialState();
let summarizer: ReturnType<typeof createSummarizer> | undefined;

// Read the effective `launcher.json`. The home file replaces the project's wholesale, which is a
// deliberate asymmetry: a home file is the user's own preference over a project's committed rail, and
// a merge would leave them guessing which project entry won.
function readCommands(capabilities: TabPluginServerCapabilities): void {
  const root = capabilities.originTab()?.root ?? process.cwd();
  const read = readLauncherFile(homedir(), root);
  state.commands = read.commands;
  state.source = read.source;
  state.filePath = read.filePath;
  state.problem = read.problem;
  // Reset so a file edited between two invocations is read fresh and its problem is said again.
  state.reported = false;
}

// Report a problem with the effective file once, to the notifications feed. The rail is a docked view
// with no transcript of its own, so a line written into one would never be read — and a problem
// repeated on every republish would be a notification per keystroke.
function reportProblem(capabilities: TabPluginServerCapabilities): void {
  if (state.reported || state.problem === undefined) return;
  state.reported = true;
  capabilities.notifyUser(state.problem);
}

// Republish the payload from the rows just handed over, unless nothing moved. Returns whether it
// wrote, so the `tabs` topic's handler can tell a republish from a no-op.
function republish(
  capabilities: TabPluginServerCapabilities,
  rows: readonly TabActivityEntry[],
): boolean {
  const projected = toRows(rows);
  if (!rowsChanged(state, projected)) return false;
  state.rows = projected;
  capabilities.updateTab(LAUNCHER_INSTANCE_KEY, () => ({
    title: LAUNCHER_LABEL,
    payload: payloadOf(state, projected),
  }));
  return true;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isLauncherPayload,
    opener: noFileOpener('launcher'),
    // `launcher` opens or focuses the singleton tab docked left; `launcher right` puts it on the
    // right. The argument grammar is the one every dockable list plugin reads, so the three commands
    // cannot drift apart — the one difference is the default, because the launcher's whole purpose is
    // to be the sidebar's home rather than another tab in the strip.
    command: (argument, capabilities) => {
      const dock = parseDockArgument(argument);
      if (dock === undefined) {
        capabilities.rejectRequest('Usage: launcher [left|right]');
        return;
      }
      readCommands(capabilities);
      capabilities.openOrFocusTab(LAUNCHER_INSTANCE_KEY, () => ({
        title: LAUNCHER_LABEL,
        payload: payloadOf(state, state.rows ?? toRows(capabilities.tabActivity())),
      }));
      capabilities.dockTab(LAUNCHER_INSTANCE_KEY, dock ?? 'left');
      republish(capabilities, capabilities.tabActivity());
      reportProblem(capabilities);
      summarizer ??= summarize(capabilities);
    },
    // The `tabs` topic's push. Delivered on the raw state broadcast, which is why the handler drops a
    // republish whose rows have not moved — this is what keeps a per-mutation signal from becoming a
    // per-mutation broadcast.
    notify: (event: TabPluginNotification, capabilities) => {
      if (event.topic !== 'tabs') return;
      // The launcher closing is a tab change like any other, and it is the one that matters most: the
      // summarizer runs on its own 30-second timer and would otherwise outlive the view it writes for.
      if (event.tabs.length === 0) {
        summarizer?.dispose();
        summarizer = undefined;
        return;
      }
      republish(capabilities, event.data);
    },
    intent: defineIntents('launcher', isLauncherPayload, {
      // A click on a command rail row. The server resolves the id back to the line it read from the
      // file, so a client cannot name a line the file did not hold.
      'run-command': {
        payload: isRunCommandIntent,
        run: (_tab, payload: LauncherRunCommandIntent, capabilities) => {
          const entry = state.commands.find((candidate) => candidate.id === payload.id);
          if (!entry) return null;
          void capabilities.dispatchLineWithOutput(entry.command);
          return null;
        },
      },
      // A click on a tab row: focus it in the centre strip. Refused by the host for a label with no
      // open tab, so a row that closed between a click and its intent does nothing.
      'focus-tab': {
        payload: isFocusTabIntent,
        run: (_tab, payload: LauncherFocusTabIntent, capabilities) => {
          capabilities.topicAction({ topic: 'tabs', action: 'focus', label: payload.label });
          return null;
        },
      },
      // The Configure button. It dispatches the application's own `edit` on the file in effect rather
      // than opening it through `openInEditor`, whose root boundary would refuse the home file.
      configure: {
        payload: isRunCommandIntent,
        run: (_tab, payload: LauncherRunCommandIntent, capabilities) => {
          if (payload.id !== CONFIGURE_INTENT_ID) return null;
          void capabilities.dispatchLineWithOutput(`edit ${state.filePath}`);
          return null;
        },
      },
      // A line typed into the launcher's own command bar. Answered with what the line produced, so
      // the bar can show the reply instead of running a command silently — the same answer the
      // dispatcher's other caller gets, from the same one call.
      dispatch: {
        payload: isDispatchIntent,
        run: async (_tab, payload: LauncherDispatchIntent, capabilities) =>
          capabilities.dispatchLineWithOutput(payload.line),
      },
    }),
    dispose: () => {
      summarizer?.dispose();
      summarizer = undefined;
      Object.assign(state, initialState());
    },
  };
}

// The ACP session that answers "what is each tab doing", running through the launcher tab's own core ACP
// connection — the published `startAcp`/`promptAcp` route, which a plugin can use and a subprocess of its
// own cannot, and which is tool-less by construction because core denies a tool request the caller has
// not opted in.
//
// It reads the host's tabs itself at flush time through the launcher's own capability, so a prompt never
// summarizes a stale snapshot, and it stops the moment the launcher's tab is gone — which is how it
// knows, since the launcher's own tab closing is the `tabs` delivery that carries no instance keys.
//
// The persona's first line is a harness directive naming a subprocess this session never spawns, so only
// the body after it is sent. The session's model is the launcher tab's own ACP model.
function summarize(capabilities: TabPluginServerCapabilities): ReturnType<typeof createSummarizer> {
  const root = () => capabilities.originTab()?.root ?? process.cwd();
  return createSummarizer({
    capabilities,
    personaBody: () => readPersonaBody(root()),
    readTabs: () => capabilities.tabActivity(8),
    isTabOpen: () => summarizer !== undefined,
    publish: (summaries) => {
      state.summaries = { ...state.summaries, ...Object.fromEntries(summaries) };
      const rows = state.rows;
      if (rows === null) return;
      capabilities.updateTab(LAUNCHER_INSTANCE_KEY, () => ({
        title: LAUNCHER_LABEL,
        payload: payloadOf(state, rows),
      }));
    },
    onError: (reason) => { capabilities.notifyUser(`launcher summarizer: ${reason}`); },
  });
}
