import type { PatchHunk, PatchHunkLine } from './parse-hunks.js';

export type ApplyHunksResult = { ok: true; text: string } | { ok: false; line: string };

type TextLines = { lines: string[]; ending: string; finalNewline: boolean };
type Replacement = { start: number; count: number; lines: string[] };

function splitText(text: string): TextLines {
  const newline = text.indexOf('\n');
  const ending = newline > 0 && text[newline - 1] === '\r' ? '\r\n' : '\n';
  const finalNewline = text === '' || text.endsWith('\n');
  if (text === '') return { lines: [], ending, finalNewline };
  const body = finalNewline ? text.slice(0, -1) : text;
  const lines = body.split('\n').map((line) => ending === '\r\n' && line.endsWith('\r') ? line.slice(0, -1) : line);
  return { lines, ending, finalNewline };
}

function findBlock(lines: string[], block: string[], from: number, endOfFile: boolean): number {
  if (block.length === 0) return endOfFile ? lines.length : from;
  const last = lines.length - block.length;
  const first = endOfFile ? last : from;
  if (first < from) return -1;
  for (const relaxed of [false, true]) {
    for (let index = first; index <= last; index += 1) {
      const matches = block.every((value, offset) => {
        const actual = lines[index + offset];
        return relaxed ? actual.trimEnd() === value.trimEnd() : actual === value;
      });
      if (matches) return index;
      if (endOfFile) break;
    }
  }
  return -1;
}

function replacementLines(hunkLines: PatchHunkLine[], lines: string[], start: number): string[] {
  const result: string[] = [];
  let offset = 0;
  for (const line of hunkLines) {
    if (line.kind === 'add') result.push(line.text);
    else {
      if (line.kind === 'context') result.push(lines[start + offset]);
      offset += 1;
    }
  }
  return result;
}

export function applyHunks(text: string, hunks: PatchHunk[]): ApplyHunksResult {
  if (hunks.length === 0) return { ok: true, text };
  const source = splitText(text);
  const replacements: Replacement[] = [];
  let position = 0;
  for (const hunk of hunks) {
    if (hunk.anchor !== undefined) {
      const anchor = findBlock(source.lines, [hunk.anchor], position, false);
      if (anchor < 0) return { ok: false, line: hunk.anchor };
      position = anchor + 1;
    }
    const old = hunk.lines.filter((line) => line.kind !== 'add').map((line) => line.text);
    const start = findBlock(source.lines, old, position, hunk.endOfFile);
    if (start < 0) return { ok: false, line: old[0] };
    replacements.push({ start, count: old.length, lines: replacementLines(hunk.lines, source.lines, start) });
    position = start + old.length;
  }
  const result: string[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    while (cursor < replacement.start) result.push(source.lines[cursor++]);
    for (const line of replacement.lines) result.push(line);
    cursor = replacement.start + replacement.count;
  }
  while (cursor < source.lines.length) result.push(source.lines[cursor++]);
  const joined = result.join(source.ending);
  return { ok: true, text: result.length > 0 && source.finalNewline ? joined + source.ending : joined };
}
