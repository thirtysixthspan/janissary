import type { LogEntry, BufferLine } from './types.js';
import { formatMessageContent, tryCollapseToolSteps } from './buffer.js';

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

export function handleCollapsedToolSteps(
  log: LogEntry[],
  index: number,
  lines: BufferLine[],
  shouldCollapseToolSteps: boolean,
): { handled: boolean; newIndex: number } {
  if (!shouldCollapseToolSteps) return { handled: false, newIndex: index };
  const collapse = tryCollapseToolSteps(log, index);
  if (!collapse) return { handled: false, newIndex: index };
  if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
  lines.push({
    type: 'collapsed',
    text: `${collapse.count} tool step${collapse.count === 1 ? '' : 's'}`,
    acp: true,
  });
  return { handled: true, newIndex: collapse.newIndex };
}

export function handleTerminalEntry(entry: LogEntry, lines: BufferLine[]): boolean {
  if (!entry.terminal) return false;
  if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
  lines.push({ type: 'terminal', text: '', terminal: entry.terminal });
  return true;
}

export function handleMessageEntry(entry: LogEntry, lines: BufferLine[]): boolean {
  if (!entry.from) return false;
  if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
  const parts = entry.output.split('\n');
  lines.push(...formatMessageContent(entry, parts));
  return true;
}

export function handleInputOutput(entry: LogEntry, lines: BufferLine[]): boolean {
  if (!entry.input && !entry.output) return false;
  if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
  if (entry.input) {
    lines.push({
      type: 'prompt',
      text: expandTabs(entry.input),
      cwd: entry.cwd,
      acp: entry.acp,
      running: entry.running,
    });
  }
  if (entry.output) {
    if (entry.markdown) {
      lines.push({ type: 'markdown', text: entry.output });
    } else {
      for (const outLine of entry.output.split('\n')) {
        lines.push({ type: 'output', text: expandTabs(outLine), acp: entry.acp });
      }
    }
  }
  return true;
}
