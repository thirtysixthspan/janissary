import type { LogEntry, Tab, ImageView, MarkdownView, EditorView, PageView, HarnessView, FileNavigatorView } from '../types.js';
export { expandTabs, wordWrap, flattenBuffer } from './formatting.js';
export { distinctColor, dotColors } from './colors.js';
export { stripComments, renumberTabs, canMoveTab, swapTabsLeft, swapTabsRight, insertTabInGroup, uniqueLabel } from './utils.js';

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
  workspaceDir: workspaceDirectory,
});

// An image view tab (opened via `open <image>`). It carries no transcript/history/shell — just the
// image payload — and is always titled `image` while keeping a unique `label` so several can coexist.
export const makeImageTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, image: ImageView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'image',
  title: 'image',
  image,
});

// A page view tab (opened via `open https://…` or `open page …`). Renders an iframe; carries no
// transcript/history/shell. The title shows the domain (e.g. "slashdot.org").
export const makePageTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, page: PageView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'page',
  title: page.domain,
  page,
});

// A markdown view tab (opened via `open <file>.md`). Renders the file as formatted Markdown.
export const makeMarkdownTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, markdown: MarkdownView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'markdown',
  title: 'markdown',
  markdown,
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

// A file tree view tab (opened via `files [path]`). Shows a directory tree rooted at `files.root`.
export const makeFilesTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, files: FileNavigatorView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'files',
  title: 'navigator',
  files,
});

// A notifications view tab (opened via `notifications`). A singleton, view-only feed whose body is
// the standard transcript fed by its own `log`; it takes no typed input. Live and in-memory like
// the file tree tab — never persisted, never restored on `--relaunch`.
export const makeNotificationsTab = (label: string, dotColor: string, number: number, group: number, groupColor: string): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'notifications',
  title: 'notifications',
});

// A schedules view tab (opened via `schedules`). A singleton, view-only tab whose body reflects the
// aggregated schedule list computed per state emit. Live and in-memory like the notifications tab —
// never persisted, never restored on `--relaunch`.
export const makeSchedulesTab = (label: string, dotColor: string, number: number, group: number, groupColor: string): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'schedules',
  title: 'schedules',
});



