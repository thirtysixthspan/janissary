// Wire types shared between the Node server and the React web client.
// The web client imports these directly via the @shared path alias — no mirror needed.
//
// The declarations themselves live in per-domain modules under ./protocol/, so a feature adding an
// RPC edits its own domain's file instead of colliding with every other feature in this one. This
// module is the wire boundary: it composes the cross-domain `RpcCall`/`ClientMessage` unions and
// re-exports the domain types, so every consumer keeps importing from `./protocol.js`
// (`@shared/protocol` on the client).
import type { CoreRpcCall } from './protocol/core-rpc.js';
import type { FileNavigatorRpcCall } from './protocol/file-navigator.js';
import type { EditorRpcCall } from './protocol/editor.js';
import type { MonitorRpcCall } from './protocol/monitor.js';
import type { ScheduleRpcCall } from './protocol/schedule.js';
import type { PluginRpcCall } from './protocol/plugin.js';

export type { BufferLine, HarnessView, EditorView, RemoteTarget, TerminalEntry, FileNavigatorView, FileNavigatorDetail, FileNavigatorRow, TaskRow } from './tab/types.js';
export type { CompletionResult } from './completion/types.js';
export type { ProfileRow } from './profile/types.js';

export type ConversationHarness = 'claude' | 'opencode';

export type ConversationModelPair = {
  harness: ConversationHarness;
  model: string;
};

export type ConversationSummaryView = {
  id: string;
  title: string;
  updatedAt: number;
};

export type ConversationTurnView = {
  query: string;
  response: string;
  pair: ConversationModelPair;
  error?: string;
  streaming?: boolean;
};

export type ConversationWindowView = {
  id: string;
  title: string;
  pair: ConversationModelPair;
  turns: ConversationTurnView[];
  hasOlder: boolean;
  deleted?: boolean;
};

export type ConversationsView = {
  summaries: ConversationSummaryView[];
  windows: ConversationWindowView[];
  models: ConversationModelPair[];
};

export type { PluginTabView, PluginIntentRequest, PluginFailedRequest, PluginRpcCall } from './protocol/plugin.js';
export type { ScheduleView, AggregatedScheduleView, ScheduleLaunchView, ScheduleRpcCall } from './protocol/schedule.js';
export type { SuggestionView, MonitorRpcCall } from './protocol/monitor.js';
export type { SuggestHunk, EditorRpcCall } from './protocol/editor.js';
export type {
  FileOpenerChoice,
  FileOpenerResolution,
  FileSelectionAction,
  BulkConflictPolicy,
  BatchResult,
  BulkMoveResult,
  MoveConflict,
  UndoRedoResult,
  FileNavigatorSelectionRecord,
  FileNavigatorRpcCall,
} from './protocol/file-navigator.js';
export type {
  AcpRef,
  ConnectionView,
  RouteChooserView,
  HarnessLaunchView,
  QuestionKind,
  PendingQuestionView,
  TabView,
} from './protocol/tab.js';
export type {
  StateEvent,
  PtyDataEvent,
  PtyExitEvent,
  RpcReply,
  ByeEvent,
  LayoutEvent,
  CollectTreeStateEvent,
  ServerEvent,
} from './protocol/events.js';

// Client -> server requests: every domain's slice of the protocol, joined into the one union the
// server's message handler and the client's RPC helper both switch on.
export type RpcCall =
  | CoreRpcCall
  | FileNavigatorRpcCall
  | EditorRpcCall
  | MonitorRpcCall
  | ScheduleRpcCall
  | PluginRpcCall;

export type ClientMessage = { t: 'rpc'; id: number } & RpcCall;
