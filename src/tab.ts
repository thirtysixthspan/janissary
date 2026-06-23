export type LogEntry = {
  input: string;
  output: string;
  running?: boolean;
  cwd?: string;
  // Set when this entry is a cross-agent message from another agent.
  from?: string;
  fromColor?: string;
  msgKind?: 'info' | 'request' | 'response';
  // Set when this entry is an auto-ran agent command (e.g. ACP db loop).
  acp?: boolean;
};

export type MessageRenderKind = 'info' | 'request' | 'response';

export type BufferLine = {
  type: 'prompt' | 'output' | 'spacer' | 'message' | 'collapsed';
  text: string;
  cwd?: string;
  from?: string;
  fromColor?: string;
  msgKind?: MessageRenderKind;
  acp?: boolean;
};

export type Tab = {
  label: string;
  dotColor: string;
  number: number;
  log: LogEntry[];
  cmdHistory: string[];
  cmdHistoryIdx: number;
  scrollOffset: number;
  workspaceDir?: string;
  // When false/undefined, contiguous runs of auto-run agent tool steps (acp entries) are
  // collapsed into a single summary line in the transcript. Toggled with Ctrl+T. In-memory
  // only (like scrollOffset) — not persisted to agent state.
  toolStepsExpanded?: boolean;
};

export const dotColors = [
  '#5b9cff', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff8a5c', '#a66cff', '#ff6f91', '#00d2d3', '#f368e0',
  '#ff9f43', '#54a0ff', '#5f27cd', '#01a3a4', '#ee5a24',
];

export const makeTab = (label: string, dotColor: string, number: number = 1, cmdHistory: string[] = [], log: LogEntry[] = [], workspaceDir?: string): Tab => ({
  label,
  dotColor,
  number,
  log,
  cmdHistory,
  cmdHistoryIdx: -1,
  scrollOffset: 0,
  workspaceDir,
});

export function getFrequentHistory(history: string[], count: number): string[] {
  const freq = new Map<string, number>();
  for (const cmd of history) {
    freq.set(cmd, (freq.get(cmd) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([cmd]) => cmd)
    .slice(-count);
}

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
    let cur = '';
    for (const word of line.split(' ')) {
      if (word.length > width) {
        if (cur) out.push(cur);
        let w = word;
        while (w.length > width) { out.push(w.slice(0, width)); w = w.slice(width); }
        cur = w;
      } else if (cur === '') {
        cur = word;
      } else if (cur.length + 1 + word.length <= width) {
        cur += ' ' + word;
      } else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
  }
  return out.join('\n');
}

// Box-drawing characters that begin a rendered table line — used to tell a formatted
// table row apart from prose so it isn't word-wrapped.
const TABLE_LINE = /^[┌├└│┬┼┴┐┤┘─]/;

// Split a markdown table row into trimmed cells, dropping the optional leading/trailing pipe.
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// A markdown header/body delimiter row: every cell is dashes with optional alignment colons.
function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

// Render a parsed table (header + body rows) as box-drawn lines with padded columns.
function renderTable(header: string[], rows: string[][]): string[] {
  const ncol = header.length;
  const norm = (r: string[]) => Array.from({ length: ncol }, (_, i) => r[i] ?? '');
  const all = [header, ...rows].map(norm);
  const widths = Array.from({ length: ncol }, (_, i) => Math.max(1, ...all.map((r) => r[i].length)));
  const bar = (l: string, m: string, r: string) => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r;
  const fmt = (r: string[]) => '│' + norm(r).map((c, i) => ` ${c.padEnd(widths[i])} `).join('│') + '│';
  return [bar('┌', '┬', '┐'), fmt(header), bar('├', '┼', '┤'), ...rows.map(fmt), bar('└', '┴', '┘')];
}

// Replace GitHub-flavored markdown tables in `text` with aligned, box-drawn tables. A table
// is a row containing `|` immediately followed by a `---` separator row; body rows continue
// until a line without a `|`. Non-table text is returned untouched. Used for agent (ACP)
// replies, which often answer with markdown tables.
export function formatMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i];
    const next = lines[i + 1];
    if (header.includes('|') && next !== undefined && isSeparatorRow(splitTableRow(next))) {
      const headerCells = splitTableRow(header);
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length && lines[j].includes('|'); j++) rows.push(splitTableRow(lines[j]));
      out.push(...renderTable(headerCells, rows));
      i = j - 1;
      continue;
    }
    out.push(header);
  }
  return out.join('\n');
}

// Prepare agent output for the transcript: render any markdown tables as aligned tables,
// and word-wrap the remaining prose lines (table lines are left intact so their columns
// stay aligned).
export function formatAgentOutput(text: string, width: number): string {
  return formatMarkdownTables(text)
    .split('\n')
    .map((line) => (TABLE_LINE.test(line) ? line : wordWrap(line, width)))
    .join('\n');
}

// An entry that contributes nothing to the transcript (e.g. an empty ACP continuation
// turn). Such entries are skipped when rendering and do not break a run of tool steps.
const isEmptyEntry = (e: LogEntry): boolean => !e.from && !e.input && !e.output;

export function flattenBuffer(log: LogEntry[], collapseToolSteps = false): BufferLine[] {
  const lines: BufferLine[] = [];
  for (let idx = 0; idx < log.length; idx++) {
    const entry = log[idx];

    // Collapse a contiguous run of auto-run agent tool steps (acp entries) into one
    // summary line. Empty entries interspersed in the run (continuation turns that
    // produced no prose) are absorbed without breaking the run.
    if (collapseToolSteps && entry.acp && !entry.from) {
      let count = 0;
      let j = idx;
      while (j < log.length) {
        const e = log[j];
        if (isEmptyEntry(e)) { j++; continue; }
        if (e.acp && !e.from) { count++; j++; continue; }
        break;
      }
      if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
      lines.push({ type: 'collapsed', text: `${count} tool step${count === 1 ? '' : 's'}`, acp: true });
      idx = j - 1;
      continue;
    }

    if (entry.from) {
      // Blank separator line above each message.
      if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
      const kind = entry.msgKind ?? 'info';
      const parts = entry.output.split('\n');
      if (kind === 'response') {
        // Response: a `● <from>:` header, then the output starting on the next line,
        // every line bordered in the responder's color.
        lines.push({ type: 'message', text: '', from: entry.from, fromColor: entry.fromColor, msgKind: 'response' });
        for (const line of parts) {
          lines.push({ type: 'output', text: expandTabs(line), fromColor: entry.fromColor });
        }
      } else {
        // info: `● <from>: <text>`; request: `● request from <from>: <text>`.
        lines.push({ type: 'message', text: expandTabs(parts[0] ?? ''), from: entry.from, fromColor: entry.fromColor, msgKind: kind });
        for (const extra of parts.slice(1)) {
          lines.push({ type: 'output', text: expandTabs(extra), fromColor: entry.fromColor });
        }
      }
      continue;
    }
    // Skip entries with no input and no output (e.g. empty ACP continuation turns).
    if (!entry.input && !entry.output) continue;
    // Blank separator line above each entry.
    if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
    // Continuation turns with empty input render output without a prompt line.
    if (entry.input) {
      lines.push({ type: 'prompt', text: expandTabs(entry.input), cwd: entry.cwd, acp: entry.acp });
    }
    if (entry.output) {
      for (const outLine of entry.output.split('\n')) {
        lines.push({ type: 'output', text: expandTabs(outLine), acp: entry.acp });
      }
    }
  }
  return lines;
}

// Strip ## comments from a command. A terminated comment `## text ##` is removed
// wherever it appears; an unterminated `## text` removes everything from `##` to the
// end. Each alternative consumes a `##`, then either runs non-greedily to a closing
// `##` or, failing that, to the end of the string.
export function stripComments(cmd: string): string {
  return cmd.replace(/\s*##(?:[\s\S]*?##\s*|[\s\S]*)/g, ' ').trim();
}

export function renumberTabs(tabs: Tab[]): Tab[] {
  return tabs.map((t, i) => ({ ...t, number: i + 1 }));
}

export function swapTabsLeft(tabs: Tab[], idx: number): Tab[] {
  if (idx <= 0) return tabs;
  const next = [...tabs];
  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
  return renumberTabs(next);
}

export function swapTabsRight(tabs: Tab[], idx: number): Tab[] {
  if (idx >= tabs.length - 1) return tabs;
  const next = [...tabs];
  [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
  return renumberTabs(next);
}
