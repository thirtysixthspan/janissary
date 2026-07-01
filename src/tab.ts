import type { LogEntry, Tab, ImageView, MarkdownView, PageView, HarnessView } from './types.js';
export { expandTabs, wordWrap, flattenBuffer } from './tab-formatting.js';
export { distinctColor, dotColors } from './tab-colors.js';

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

// A harness view tab (opened via `harness <name>`). The entire tab body is a live PTY terminal.
export const makeHarnessTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, harness: HarnessView, workspaceDirectory?: string): Tab => ({
  ...makeTab(label, dotColor, number, [], [], workspaceDirectory, group, groupColor),
  view: 'harness', title: label, harness,
});


// Strip ## comments from a command. A terminated comment `## text ##` is removed
// wherever it appears; an unterminated `## text` removes everything from `##` to the
// end. Each alternative consumes a `##`, then either runs non-greedily to a closing
// `##` or, failing that, to the end of the string.
export function stripComments(command: string): string {
  return command.replaceAll(/\s*##(?:[\s\S]*?##\s*|[\s\S]*)/g, ' ').trim();
}

// Renumber tabs by position. Only `number` (the position) changes — `group` is left untouched,
// so a tab keeps its group through any reorder.
export function renumberTabs(tabs: Tab[]): Tab[] {
  return tabs.map((t, index) => ({ ...t, number: index + 1 }));
}

// A tab may only swap with a neighbor in the same group, so groups stay contiguous and a tab can
// never be dragged out of its group.
export function canMoveTab(tabs: Tab[], index: number, direction: -1 | 1): boolean {
  const index_ = index + direction;
  if (index < 0 || index_ < 0 || index_ >= tabs.length) return false;
  return tabs[index].group === tabs[index_].group;
}

export function swapTabsLeft(tabs: Tab[], index: number): Tab[] {
  if (!canMoveTab(tabs, index, -1)) return tabs;
  const next = [...tabs];
  const left = next[index - 1];
  next[index - 1] = next[index];
  next[index] = left;
  return renumberTabs(next);
}

export function swapTabsRight(tabs: Tab[], index: number): Tab[] {
  if (!canMoveTab(tabs, index, 1)) return tabs;
  const next = [...tabs];
  const right = next[index + 1];
  next[index + 1] = next[index];
  next[index] = right;
  return renumberTabs(next);
}

// Insert a new tab into `tabs` directly after the last tab of `group`, so a group stays a single
// connected run. When the group isn't present yet (a brand-new group), the tab goes at the end.
export function insertTabInGroup(tabs: Tab[], tab: Tab): Tab[] {
  let insertAt = tabs.length;
  for (const [index, tab_] of tabs.entries()) {
    if (tab_.group === tab.group) insertAt = index + 1;
  }
  return renumberTabs([...tabs.slice(0, insertAt), tab, ...tabs.slice(insertAt)]);
}
