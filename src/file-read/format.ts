import { FILE_READ_MAX_LIMIT, type FileReadArgs } from './command.js';

export const FILE_READ_MAX_LINE_LENGTH = 2000;

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

function displayLine(rawLine: string): string {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (line.length <= FILE_READ_MAX_LINE_LENGTH) return line;
  const codePoints = [...line];
  if (codePoints.length <= FILE_READ_MAX_LINE_LENGTH) return line;
  return `${codePoints.slice(0, FILE_READ_MAX_LINE_LENGTH).join('')}…`;
}

export function formatFileLines(text: string, args: FileReadArgs): string {
  const lines = splitLines(text);
  const total = lines.length;
  if (total === 0) return '(empty file)';
  const { offset, path } = args;
  if (offset > total) return `Offset past end of file (${total} lines): ${path}.`;
  const limit = Math.min(args.limit, FILE_READ_MAX_LIMIT);
  const last = Math.min(offset + limit - 1, total);
  const width = String(last).length;
  const numbered = lines
    .slice(offset - 1, last)
    .map((line, index) => `${String(offset + index).padStart(width)}\t${displayLine(line)}`);
  if (last < total) numbered.push(`(showing lines ${offset}-${last} of ${total}; continue with --offset ${last + 1})`);
  return numbered.join('\n');
}
