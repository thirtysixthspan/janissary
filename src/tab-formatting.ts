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

    if (entry.terminal) {
      if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
      lines.push({ type: 'terminal', text: '', terminal: entry.terminal });
      continue;
    }

    if (entry.from) {
      if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
      const parts = entry.output.split('\n');
      lines.push(...formatMessageContent(entry, parts));
      continue;
    }
    if (!entry.input && !entry.output) continue;
    if (lines.length > 0) lines.push({ type: 'spacer', text: '' });
    if (entry.input) {
      lines.push({ type: 'prompt', text: expandTabs(entry.input), cwd: entry.cwd, acp: entry.acp, running: entry.running });
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
  }
  return lines;
}
