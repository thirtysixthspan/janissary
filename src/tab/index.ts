import type { LogEntry, Tab, PluginTabRecord, EditorView, HarnessView, FileNavigatorView } from './types.js';
import type { MultiAgentRun } from '../multiagent/types.js';

export const makeTab = (label: string, dotColor: string, number: number = 1, commandHistory: string[] = [], log: LogEntry[] = [], workspaceDirectory?: string, group: number = 1, groupColor: string = dotColor): Tab => ({
  label,
  dotColor,
  number,
  group,
  groupColor,
  log,
  cmdHistory: commandHistory,
  cmdHistoryIdx: -1,
  scrollOffset: 0,
  runtime: { busy: false, context: [], queue: [] },
  workspaceDir: workspaceDirectory,
});

// A bundled-plugin view tab (opened via `open <image>`, `open <video>`, or a plugin's own command).
// It carries no transcript/history/shell — just the plugin's payload — and keeps a unique `label`
// derived from the plugin's label prefix so several can coexist.
export const makePluginTab = (
  label: string, dotColor: string, number: number, group: number, groupColor: string,
  title: string, plugin: PluginTabRecord,
): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'plugin',
  title,
  plugin,
});


// An editor view tab (opened via `open <text file>` or `edit <file>`). Hosts the plain-text editor.
export const makeEditorTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, editor: EditorView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'editor',
  title: editor.name,
  editor,
});

// A harness view tab (opened via `harness <name>`). The entire tab body is a live PTY terminal.
export const makeHarnessTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, harness: HarnessView, workspaceDirectory?: string): Tab => ({
  ...makeTab(label, dotColor, number, [], [], workspaceDirectory, group, groupColor),
  view: 'harness', title: label, harness,
});

// A file navigator view tab (opened via `files [path]`). Shows a directory tree rooted at `files.root`.
export const makeFilesTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, files: FileNavigatorView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'files',
  title: 'navigator',
  files,
});

// A multi-agent view tab (opened via `fanout <members> <prompt>`). Shows one prompt above a row per
// member — its state while it works, its answer when it lands. Titled with the prompt so a user with
// several comparisons open can tell them apart in the strip; the tab's own `workspaceDir` stays
// empty, because the N clones live in `MultiAgentManager` and are released through it.
export const makeMultiAgentTab = (
  label: string, dotColor: string, number: number, group: number, groupColor: string,
  run: MultiAgentRun, offline: boolean,
): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'multiagent',
  title: run.prompt,
  multiagent: run,
  ...(offline && { offline: true }),
});

// A notifications view tab (opened via `notifications`). A singleton, view-only feed whose body is
// the standard transcript fed by its own `log`; it takes no typed input. Live and in-memory like
// the file navigator tab — never persisted, never restored on `--relaunch`.
export const makeNotificationsTab = (label: string, dotColor: string, number: number, group: number, groupColor: string): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'notifications',
  title: 'notifications',
});

