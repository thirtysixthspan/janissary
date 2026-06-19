export type LogEntry = {
  input: string;
  output: string;
  running?: boolean;
  cwd?: string;
};

export type BufferLine = {
  type: 'prompt' | 'output' | 'spacer';
  text: string;
  cwd?: string;
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

export function flattenBuffer(log: LogEntry[]): BufferLine[] {
  const lines: BufferLine[] = [];
  for (const entry of log) {
    // Blank separator line above each command (a real buffer line so the scroll/viewport
    // math counts it — using an Ink marginTop would overflow the fixed-height transcript).
    if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
    lines.push({ type: 'prompt', text: entry.input, cwd: entry.cwd });
    if (entry.output) {
      for (const outLine of entry.output.split('\n')) {
        lines.push({ type: 'output', text: outLine });
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
