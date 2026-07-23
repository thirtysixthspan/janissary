import type { LogEntry, BufferLine } from './types.js';
import { expandTabs } from './tab/index.js';

function isEmptyEntry(entry: LogEntry): boolean {
  return !entry.from && !entry.input && !entry.output;
}

export function tryCollapseToolSteps(log: LogEntry[], index: number): { count: number; newIndex: number } | null {
  const entry = log[index];
  if (!entry.acp || entry.from) return null;

  let count = 0;
  let index_ = index;
  while (index_ < log.length) {
    const logEntry = log[index_];
    if (isEmptyEntry(logEntry)) { index_++; continue; }
    if (logEntry.acp && !logEntry.from) { count++; index_++; continue; }
    break;
  }
  return { count, newIndex: index_ - 1 };
}

export function formatMessageContent(entry: LogEntry, parts: string[]): BufferLine[] {
  const kind = entry.msgKind ?? 'info';
  const lines: BufferLine[] = [];

  if (kind === 'response') {
    lines.push({
      type: 'message',
      text: '',
      from: entry.from,
      fromColor: entry.fromColor,
      msgKind: 'response',
      ...(entry.openFile && { openFile: entry.openFile }),
      ...(entry.openTab && { openTab: entry.openTab }),
    });
    for (const line of parts) {
      lines.push({ type: 'output', text: expandTabs(line), fromColor: entry.fromColor });
    }
  } else {
    lines.push({
      type: 'message',
      text: expandTabs(parts[0] ?? ''),
      from: entry.from,
      fromColor: entry.fromColor,
      msgKind: kind,
      ...(entry.openFile && { openFile: entry.openFile }),
      ...(entry.openTab && { openTab: entry.openTab }),
    });
    for (const extra of parts.slice(1)) {
      lines.push({ type: 'output', text: expandTabs(extra), fromColor: entry.fromColor });
    }
  }

  return lines;
}
