// Tab-presentation wire types, composed into the shared contract by ../protocol.ts.
import type { BufferLine, HarnessView, EditorView, FileNavigatorView } from '../tab/types.js';
import type { PluginTabView } from './plugin.js';
import type { ScheduleView } from './schedule.js';
import type { SuggestionView } from './monitor.js';

// Identifies the ACP session behind a connections-panel row, for the `openAcpTranscript` RPC to
// route on: the tab's own agent, a monitor session, or an editor-persona session.
export type AcpRef =
  | { scope: 'tab'; label: string }
  | { scope: 'monitor'; name: string }
  | { scope: 'editor'; label: string; persona: string };

// One row in the floating "connections" panel (shell / acp / terminal card / sqlite). `acpRef` is
// set on every `kind: 'acp'` row, identifying which session the row's transcript button opens.
export type ConnectionView = { text: string; kind: 'shell' | 'acp' | 'browser' | 'terminal' | 'sqlite' | 'ssh'; acpRef?: AcpRef };

// A pending route chooser: the unprefixed command plus the option labels to pick from.
export type RouteChooserView = { cmd: string; choices: string[] };

// The open "New harness" launch dialog's data: the ordered harness names and each harness's known
// model catalog (empty for a harness with no catalog). Null in the snapshot when the dialog is closed.
export type HarnessLaunchView = { names: string[]; models: Record<string, string[]> };

export type QuestionKind = 'ask' | 'approve';
export type PendingQuestionView = {
  id: string;
  tab: string;
  kind: QuestionKind;
  question: string;
  options?: string[];
};

// A tab as the client renders it: presentation metadata plus the already-flattened transcript
// lines (the server owns `flattenBuffer`, so the client never needs it).
export type TabView = {
  label: string;
  number: number;
  dotColor: string;
  group: number;
  groupColor: string;
  busy: boolean;
  // True when the tab has unseen output (see Tab.hasUnread). Drives the tab-strip badge.
  hasUnread: boolean;
  cwd: string;
  // Identifiers of this tab's currently-active flags (e.g. 'workspaced', 'autoApprove'), for the
  // metadata row's flag-emoji display. Empty when none are active.
  flags?: string[];
  // provider/model of a connected ACP agent on this tab, if any.
  acp?: string;
  connections: ConnectionView[];
  schedule: ScheduleView[];
  bufferLines: BufferLine[];
  cmdHistory: string[];
  commandQueue: string[];
  toolStepsExpanded: boolean;
  pendingQuestion?: PendingQuestionView;
  // Body kind: undefined/`'agent'` for a normal tab, or the named live view kind.
  view?: 'agent' | 'plugin' | 'harness' | 'editor' | 'monitor' | 'files' | 'notifications';
  // Display name when it differs from `label` (a plugin tab is titled by its plugin).
  title?: string;
  // Bundled-plugin envelope, present only when `view === 'plugin'`.
  plugin?: PluginTabView;
  // Harness-view payload, present only when `view === 'harness'`.
  harness?: HarnessView;
  // Editor-view payload, present only when `view === 'editor'`.
  editor?: EditorView;
  // Monitor-window payload, present only when `view === 'monitor'`: the suggestion feed, the
  // persona name, the monitored tabs/groups (pre-formatted), and the running total of bytes
  // sent/received on the monitor's dedicated ACP session.
  monitor?: { suggestions: SuggestionView[]; persona: string; targets: string; contextBytes: number };
  // File-navigator payload, present only when `view === 'files'`.
  files?: FileNavigatorView;
  // Set while a full-tab interactive PTY (htop, vim, etc.) is running on this agent tab.
  // Cleared on exit; the client hides the transcript while this is set.
  activePty?: string;
  // Set when this tab is docked into a sidebar instead of living in the central tab strip.
  // Absent means center. A docked tab is never the active tab. See product/specs/sidebars.md.
  dock?: 'left' | 'right';
  pane?: 'right';
};
