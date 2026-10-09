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
  isReportIconIntent,
  isRunCommandIntent,
  type LauncherDispatchIntent,
  type LauncherFocusTabIntent,
  type LauncherReportIconIntent,
  type LauncherRunCommandIntent,
} from './shared.js';
import { readLauncherFile } from './commands-file.js';
import { readPersonaBody } from './persona.js';
import {
  initialSummarizerState,
  summarizeOnce,
  type SummarizerState,
} from './summarizer.js';
import { initialState, payloadOf, rowsChanged, toRows, type LauncherState } from './payload.js';

// There is one launcher for the life of the server, so its state is module state. The one thing that must
// be per-launcher rather than per-server is the summarizer's cursors, which describe what this tab has
// already been told and reset when it does.
const state: LauncherState = initialState();
let summarizer: SummarizerState = initialSummarizerState();

// Read the effective `launcher.json`. The home file replaces the project's wholesale, which is a
// deliberate asymmetry: a home file is the user's own preference over a project's committed rail, and a
// merge would leave them guessing which project entry won.
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
// with no transcript of its own, so a line written into one would never be read — and a problem repeated
// on every republish would be a notification per keystroke.
function reportProblem(capabilities: TabPluginServerCapabilities): void {
  if (state.reported || state.problem === undefined) return;
  state.reported = true;
  capabilities.notifyUser(state.problem);
}

// Republish the payload from the rows just handed over, unless nothing moved. Returns whether it wrote,
// so the `tabs` topic's handler can tell a republish from a no-op.
function republish(capabilities: TabPluginServerCapabilities, rows: readonly TabActivityEntry[]): boolean {
  const projected = toRows(rows, activeLabelOf(capabilities));
  if (!rowsChanged(state, projected)) return false;
  state.rows = projected;
  capabilities.updateTab(LAUNCHER_INSTANCE_KEY, () => ({
    title: LAUNCHER_LABEL,
    payload: payloadOf(state, projected),
  }));
  return true;
}

// The label of the tab the host names as active, or undefined when there is none to name. The launcher's
// own tab is docked and can never be it, so this is a tab it is showing rather than itself.
function activeLabelOf(capabilities: TabPluginServerCapabilities): string | undefined {
  const active = capabilities.tabActivity().find((tab) => tab.active);
  return active?.label;
}

// How many of a tab's most recent transcript entries a summarizer flush asks the host for. Bounded
// and positive, because an undefined limit is the host's answer for "no transcript content at all":
// a display read omits it, and a prompt fed only metadata has nothing to summarize.
const SUMMARIZER_TAIL_ENTRIES = 8;

// The tabs the launcher shows: every tab the host has open, minus this launcher's own. The
// launcher's transcript is where its own prompts and replies land, so leaving it in would make every
// flush find new content in a tab the summarizer itself just wrote — a prompt that can never go
// quiet, whose tail contains its own previous replies. It is matched on the plugin record
// rather than on the dock side, so the rail and the summarizer agree even if the launcher is undocked.
function ownTabs(capabilities: TabPluginServerCapabilities): TabActivityEntry[] {
  return capabilities.tabActivity().filter((tab) => !isLauncherOwn(tab));
}

// What a summarizer flush reads: the same tabs, re-read with their transcript tails attached. A
// display read asks for none — the rail draws no transcript content, and the payload must never carry
// it — so this is a second read rather than the same one with a flag flipped.
function summarizedTabs(capabilities: TabPluginServerCapabilities): TabActivityEntry[] {
  return capabilities.tabActivity(SUMMARIZER_TAIL_ENTRIES).filter((tab) => !isLauncherOwn(tab));
}

// Whether one activity entry is the launcher's own tab.
function isLauncherOwn(tab: TabActivityEntry): boolean {
  return tab.view === 'plugin' && tab.label === LAUNCHER_LABEL;
}

export function activate(): TabPluginActivation {
  return {
    isPayload: isLauncherPayload,
    opener: noFileOpener('launcher'),
    // `launcher` opens or focuses the singleton tab docked left; `launcher right` puts it on the right.
    // The argument grammar is the one every dockable list plugin reads, so the commands cannot drift
    // apart — the one difference is the default, because the launcher's whole purpose is to be the
    // sidebar's home rather than another tab in the strip.
    command: (argument, capabilities) => {
      const dock = parseDockArgument(argument);
      if (dock === undefined) {
        capabilities.rejectRequest('Usage: launcher [left|right]');
        return;
      }
      readCommands(capabilities);
      capabilities.openOrFocusTab(LAUNCHER_INSTANCE_KEY, () => ({
        title: LAUNCHER_LABEL,
        payload: payloadOf(state, state.rows ?? toRows(ownTabs(capabilities), activeLabelOf(capabilities))),
      }));
      capabilities.dockTab(LAUNCHER_INSTANCE_KEY, dock ?? 'left');
      republish(capabilities, ownTabs(capabilities));
      reportProblem(capabilities);
    },
    // The `tabs` topic's push. Delivered on the raw state broadcast, which is why the handler drops a
    // republish whose rows have not moved — this is what keeps a per-mutation signal from becoming a
    // per-mutation broadcast.
    notify: (event: TabPluginNotification, capabilities) => {
      if (event.topic !== 'tabs') return;
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
      // A click on a tab row: focus it in the centre strip. Refused by the host for a label with no open
      // tab, so a row that closed between a click and its intent does nothing.
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
      // A line typed into the launcher's own command bar. Answered with what the line produced, so the
      // bar can show the reply instead of running a command silently.
      dispatch: {
        payload: isDispatchIntent,
        run: async (_tab, payload: LauncherDispatchIntent, capabilities) =>
          capabilities.dispatchLineWithOutput(payload.line),
      },
      // A glyph the client's own build cannot draw, reported once so a typo in `launcher.json` is
      // explained rather than merely rendered as a fallback.
      'report-icon': {
        payload: isReportIconIntent,
        run: (_tab, payload: LauncherReportIconIntent, capabilities) => {
          capabilities.notifyUser(
            `launcher: ${payload.icon} is not an icon this build can draw — showing a fallback for its command`,
          );
          return null;
        },
      },
      // One summarizer flush, raised by the launcher's own client on its interval. It is an intent
      // rather than a timer of the plugin's own because `pluginIntent` binds the answering label to the
      // tab it names, and the core ACP capabilities only work addressed to this plugin's own tab.
      summarize: {
        payload: isEmptyLauncherIntent,
        run: async (_tab, _payload: Record<string, never>, capabilities) => {
          const live = summarizedTabs(capabilities);
          try {
            const summaries = await summarizeOnce({
              capabilities,
              state: summarizer,
              personaBody: readPersonaBody(capabilities.originTab()?.root ?? process.cwd()),
              readTabs: () => live,
            });
            if (summaries.size === 0) return null;
            // Rebuilt from the tabs live *now* rather than merged into a map that only grows: a closed
            // tab's paragraph disappears with its row, and a new tab that inherits a recycled label
            // shows nothing until its own first paragraph rather than the dead tab's text.
            const shown = new Set(live.map((tab) => tab.label));
            state.summaries = Object.fromEntries(
              [...summaries].filter(([label]) => shown.has(label)),
            );
            const rows = state.rows;
            if (rows === null) return null;
            capabilities.updateTab(LAUNCHER_INSTANCE_KEY, () => ({
              title: LAUNCHER_LABEL,
              payload: payloadOf(state, rows),
            }));
            return null;
          } catch (error) {
            capabilities.notifyUser(`launcher summarizer: ${error instanceof Error ? error.message : String(error)}`);
            return null;
          }
        },
      },
    }),
    dispose: () => {
      // A closed launcher starts its next incarnation from nothing: the rows, the summaries, and the
      // summarizer's cursors all describe a tab that no longer exists.
      Object.assign(state, initialState());
      summarizer = initialSummarizerState();
    },
  };
}

function isEmptyLauncherIntent(value: unknown): value is Record<string, never> {
  return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
}
