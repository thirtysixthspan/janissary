import type { LogEntry, MessageKind, ScheduleEntry } from '../types.js';

// Controller-facing context for a command's `run`. The Controller provides each capability scoped to
// the tab the command runs in. Every field is exercised by a migrated command.
export interface CommandContext {
  // The tab the command runs in, and the raw command text (the `input` of any log entries it adds).
  label: string;
  input: string;
  activeTab: number;
  tabCount: number;
  // Append a plain (or markdown) output line for `input` to this tab's transcript.
  out: (text: string, options?: { markdown?: boolean }) => void;
  // Append an arbitrary log entry to this tab's transcript.
  append: (entry: LogEntry) => void;
  setActiveTab: (index: number) => void;
  // Stop the whole app (the `quit`/`exit` command).
  exit: () => void;
  // Empty this tab's transcript (log reset + persist + event); the plumbing stays Controller-owned.
  clearTranscript: () => void;
  // Enqueue a message to another agent; false when no such agent exists.
  send: (message: { from: string; to: string; kind: MessageKind; text: string }) => boolean;
  // Labels of every open tab (for `broadcast all` and recipient lookup).
  agentLabels: () => string[];
  // This tab's scheduled commands, and a setter that persists the replacement list.
  getSchedule: () => ScheduleEntry[];
  setSchedule: (next: ScheduleEntry[]) => void;
  // Run a `db` command for this tab, keeping its tracked SQLite connections in sync.
  runDb: (command: string) => string;
}

export interface Command {
  name: string;
  match: (command: string) => boolean;
  // Controller-facing execution. Present for commands whose logic lives in their module; the
  // remaining built-ins (agent, profile, close, connection, acp, open, browser) are executed by the
  // Controller, which owns the tab/PTY/session machinery they need, and carry only `name`/`match`.
  run?: (command: string, context: CommandContext) => void;
}
