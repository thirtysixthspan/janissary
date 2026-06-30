import type { LogEntry, BufferLine } from './types.js';
import { handleCollapsedToolSteps, handleTerminalEntry, handleMessageEntry, handleInputOutput } from './tab-formatting-handlers.js';

export { expandTabs } from './tab-formatting-handlers.js';

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

    const collapsed = handleCollapsedToolSteps(log, index, lines, shouldCollapseToolSteps);
    if (collapsed.handled) {
      index = collapsed.newIndex;
      continue;
    }

    if (handleTerminalEntry(entry, lines)) continue;
    if (handleMessageEntry(entry, lines)) continue;
    if (handleInputOutput(entry, lines)) continue;
  }
  return lines;
}
