import type { LogEntry, BufferLine } from '../types.js';
import { handleCollapsedToolSteps, handleTerminalEntry, handleMessageEntry, handleInputOutput } from './formatting-handlers.js';

export { expandTabs } from './formatting-handlers.js';
export { wordWrap } from '../word-wrapping.js';

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
