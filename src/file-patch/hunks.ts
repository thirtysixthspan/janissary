import type { PatchHunk, PatchHunkLine } from './parse-hunks.js';
import { createLineSearch } from './hunk-search.js';

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

function assembleText(source: TextLines, replacements: Replacement[]): string {
  const result: string[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    while (cursor < replacement.start) result.push(source.lines[cursor++]);
    for (const line of replacement.lines) result.push(line);
    cursor = replacement.start + replacement.count;
  }
  while (cursor < source.lines.length) result.push(source.lines[cursor++]);
  const joined = result.join(source.ending);
  return result.length > 0 && source.finalNewline ? joined + source.ending : joined;
}

export function applyHunks(text: string, hunks: PatchHunk[]): ApplyHunksResult {
  if (hunks.length === 0) return { ok: true, text };
  const source = splitText(text);
  const search = createLineSearch(source.lines);
  const replacements: Replacement[] = [];
  let position = 0;
  for (const hunk of hunks) {
    if (hunk.anchor !== undefined) {
      const anchor = search.findLine(hunk.anchor, position);
      if (anchor < 0) return { ok: false, line: hunk.anchor };
      position = anchor + 1;
    }
    const old = hunk.lines.filter((line) => line.kind !== 'add').map((line) => line.text);
    const start = search.findBlock(old, position, hunk.endOfFile);
    if (start < 0) return { ok: false, line: old[0] };
    replacements.push({ start, count: old.length, lines: replacementLines(hunk.lines, source.lines, start) });
    position = start + old.length;
  }
  return { ok: true, text: assembleText(source, replacements) };
}
