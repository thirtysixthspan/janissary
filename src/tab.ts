import type { LogEntry, BufferLine, Tab, ImageView, MarkdownView, PageView, HarnessView } from './types.js';
import { formatMessageContent, tryCollapseToolSteps } from './buffer.js';

export const dotColors = [
  '#5b9cff', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff8a5c', '#a66cff', '#ff6f91', '#00d2d3', '#f368e0',
  '#ff9f43', '#54a0ff', '#5f27cd', '#01a3a4', '#ee5a24',
];

// Colors at least this far apart (weighted RGB distance, ~0–765) read as substantially
// different. Used to keep a new tab's color clearly distinct from those already on screen.
const COLOR_MIN_DIST = 110;

function hexToRgb(hex?: string): [number, number, number] | undefined {
  if (!hex) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Perceptually weighted RGB distance ("redmean"), cheap and good enough to rank palette colors.
function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], database = a[2] - b[2];
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * database * database);
}

// Distance from `color` to the nearest of `used` (Infinity when nothing comparable is in use).
function nearestUsedDistance(color: string, used: [number, number, number][]): number {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  if (used.length === 0) return Infinity;
  return Math.min(...used.map((u) => colorDistance(rgb, u)));
}

// Choose a dot color substantially different from every color in `used`. Keeps `preferred` when
// it is already far enough from all of them; otherwise returns the palette color whose nearest
// used color is the farthest away (the most distinct option available).
export function distinctColor(used: Iterable<string>, preferred?: string): string {
  const usedRgb = [...used].map((c) => hexToRgb(c)).filter((c): c is [number, number, number] => c !== undefined);
  if (preferred && nearestUsedDistance(preferred, usedRgb) >= COLOR_MIN_DIST) return preferred;
  let best = dotColors[0];
  let bestDistribution = -1;
  for (const c of dotColors) {
    const d = nearestUsedDistance(c, usedRgb);
    if (d > bestDistribution) { bestDistribution = d; best = c; }
  }
  return best;
}

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
export const makeHarnessTab = (label: string, dotColor: string, number: number, group: number, groupColor: string, harness: HarnessView): Tab => ({
  ...makeTab(label, dotColor, number, [], [], undefined, group, groupColor),
  view: 'harness', title: harness.name, harness,
});

// Expand tab characters to spaces (8-column tab stops). Terminals render a tab as
// several columns but Ink measures it as width 1, so leaving tabs in causes lines to
// overflow and wrap (shifting the scrollbar onto the next row). Expanding keeps the
// measured width in step with what is drawn.
export function expandTabs(text: string, tabWidth = 8): string {
  if (!text.includes('\t')) return text;
  let col = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '\t') {
      const spaces = tabWidth - (col % tabWidth);
      out += ' '.repeat(spaces);
      col += spaces;
    } else {
      out += ch;
      col += ch === '\n' ? 0 : 1;
    }
  }
  return out;
}

// Hard word-wrap text to `width` columns, inserting newlines. Used for agent output
// (e.g. ACP responses) that arrives as one long line with no carriage returns — the
// transcript is line-based, so it must be pre-split rather than relying on terminal wrap.
export function wordWrap(text: string, width: number): string {
  if (width <= 0) return text;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (line.length <= width) {
      out.push(line);
      continue;
    }
    let current = '';
    for (const word of line.split(' ')) {
      if (word.length > width) {
        if (current) out.push(current);
        let w = word;
        while (w.length > width) { out.push(w.slice(0, width)); w = w.slice(width); }
        current = w;
      } else if (current === '') {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current += ' ' + word;
      } else {
        out.push(current);
        current = word;
      }
    }
    if (current) out.push(current);
  }
  return out.join('\n');
}


export function flattenBuffer(log: LogEntry[], shouldCollapseToolSteps = false): BufferLine[] {
  const lines: BufferLine[] = [];
  for (let index = 0; index < log.length; index++) {
    const entry = log[index];

    if (shouldCollapseToolSteps) {
      const collapse = tryCollapseToolSteps(log, index);
      if (collapse) {
        if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
        lines.push({ type: 'collapsed', text: `${collapse.count} tool step${collapse.count === 1 ? '' : 's'}`, acp: true });
        index = collapse.newIndex;
        continue;
      }
    }

    // An inline terminal card (interactive program / harness PTY). Rendered as its own line
    // type so the web client can mount an xterm.js pane; carries no flattened text.
    if (entry.terminal) {
      if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
      lines.push({ type: 'terminal', text: '', terminal: entry.terminal });
      continue;
    }

    if (entry.from) {
      // Blank separator line above each message.
      if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
      const parts = entry.output.split('\n');
      lines.push(...formatMessageContent(entry, parts));
      continue;
    }
    // Skip entries with no input and no output (e.g. empty ACP continuation turns).
    if (!entry.input && !entry.output) continue;
    // Blank separator line above each entry.
    if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
    // Continuation turns with empty input render output without a prompt line.
    if (entry.input) {
      lines.push({ type: 'prompt', text: expandTabs(entry.input), cwd: entry.cwd, acp: entry.acp, running: entry.running });
    }
    if (entry.output) {
      if (entry.markdown) {
        // An ACP agent reply: keep the whole turn as one block so the client renders the Markdown
        // (splitting into per-line plain text would destroy lists, tables, code fences, etc.).
        lines.push({ type: 'markdown', text: entry.output });
      } else {
        for (const outLine of entry.output.split('\n')) {
          lines.push({ type: 'output', text: expandTabs(outLine), acp: entry.acp });
        }
      }
    }
  }
  return lines;
}

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
