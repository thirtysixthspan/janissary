export type LogEntry = {
  input: string;
  output: string;
  running?: boolean;
  cwd?: string;
  // Set when this entry is a cross-agent message from another agent.
  from?: string;
  fromColor?: string;
  msgKind?: 'info' | 'request' | 'response';
};

export type MessageRenderKind = 'info' | 'request' | 'response';

export type BufferLine = {
  type: 'prompt' | 'output' | 'spacer' | 'message';
  text: string;
  cwd?: string;
  from?: string;
  fromColor?: string;
  msgKind?: MessageRenderKind;
};

export type Tab = {
  label: string;
  dotColor: string;
  number: number;
  log: LogEntry[];
  cmdHistory: string[];
  cmdHistoryIdx: number;
  scrollOffset: number;
};

export const dotColors = [
  '#5b9cff', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff8a5c', '#a66cff', '#ff6f91', '#00d2d3', '#f368e0',
  '#ff9f43', '#54a0ff', '#5f27cd', '#01a3a4', '#ee5a24',
];

export const makeTab = (label: string, dotColor: string, number: number = 1, cmdHistory: string[] = [], log: LogEntry[] = []): Tab => ({
  label,
  dotColor,
  number,
  log,
  cmdHistory,
  cmdHistoryIdx: -1,
  scrollOffset: 0,
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

export function flattenBuffer(log: LogEntry[]): BufferLine[] {
  const lines: BufferLine[] = [];
  for (const entry of log) {
    // Blank separator line above each command (a real buffer line so the scroll/viewport
    // math counts it — using an Ink marginTop would overflow the fixed-height transcript).
    if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
    if (entry.from) {
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
    lines.push({ type: 'prompt', text: expandTabs(entry.input), cwd: entry.cwd });
    if (entry.output) {
      for (const outLine of entry.output.split('\n')) {
        lines.push({ type: 'output', text: expandTabs(outLine) });
      }
    }
  }
  return lines;
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
