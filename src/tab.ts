import type { LogEntry, Tab, ImageView, MarkdownView, EditorView, PageView, HarnessView } from './types.js';
export { expandTabs, wordWrap, flattenBuffer } from './tab-formatting.js';
export { distinctColor, dotColors } from './tab-colors.js';
export { stripComments, renumberTabs, canMoveTab, swapTabsLeft, swapTabsRight, insertTabInGroup } from './tab-utils.js';

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
// transcript/history/shell. The title shows the page number and domain (e.g. "1) slashdot.org").
export const makePageTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, page: PageView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'page',
  title: `${page.number}) ${page.domain}`,
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
  title: 'editor',
  editor,
});

// A harness view tab (opened via `harness <name>`). The entire tab body is a live PTY terminal.
export const makeHarnessTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, harness: HarnessView, workspaceDirectory?: string): Tab => ({
  ...makeTab(label, dotColor, number, [], [], workspaceDirectory, group, groupColor),
  view: 'harness', title: label, harness,
});



