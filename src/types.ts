// Re-exports of type declarations that now live colocated with their owning domain (see each
// domain's own `types.ts`, or — for single-file domains — the domain's implementation file
// directly). Kept as a barrel so the many existing `import type { ... } from './types.js'` call
// sites across the codebase don't need to change.

export type {
  LogEntry, TerminalEntry, MessageRenderKind, BufferLine, HarnessView, ImageView, PageView,
  MarkdownView, EditorView, FileNavigatorRow, FileNavigatorView, TaskRow, MonitorTarget,
  MonitorSuggestion, Tab,
} from './tab/types.js';

export type { AgentState, AgentCommand } from './agent/types.js';

export type {
  ProfileHarnessEntry, ProfileEntry, ProfileTab, ProfileAgentFile, ProfileHarnessFile,
  ProfileMonitor, ProfileMonitorFile, ProfileFilesEntry, ProfileEditorsEntry,
  ProfileNotificationsEntry, ProfileSchedulesEntry, ProfileLayout, ProfileLayoutFile, ProfileFile,
  LoadedProfile, ProfileParsed,
} from './profile/types.js';

export type { TimeOfDay, ScheduleEntry, ScheduleParseResult } from './schedule/types.js';

export type {
  PromptHandlers, AcpSession, AcpInfo, AcpOptions, AcpPromptHandlers, AcpLoopSession, AcpLoopDeps,
  AcpLoopHandlers,
} from './acp/types.js';

export type { BrowserWindow, TabBrowser, BrowserParsed } from './browser/types.js';

export type { ConnectionKind, ConnectionParsed } from './connection/types.js';

export type { DbParsed } from './database/types.js';

export type { CompletionResult } from './completion/types.js';

export type { Sinks } from './controller/types.js';

export type { LogRecord } from './transcript/types.js';

export type { MessageKind, ParsedMsg, ParsedBroadcast } from './messaging.js';

export type { AppCommand, Resolution } from './resolve.js';

export type { NotificationConfig, Config } from './config.js';

export type { BrowserProfile } from './user-agent.js';
