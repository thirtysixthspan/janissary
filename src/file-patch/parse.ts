import { parseHunks } from './parse-hunks.js';
import type { PatchBodyLine, PatchHunk } from './parse-hunks.js';

export type PatchSection =
  | { kind: 'add'; path: string; line: number; lines: string[] }
  | { kind: 'delete'; path: string; line: number }
  | { kind: 'update'; path: string; line: number; moveTo?: string; hunks: PatchHunk[] };

type WorkingSection = Exclude<PatchSection, { kind: 'update' }>
  | { kind: 'update'; path: string; line: number; moveTo?: string; bodyLines: PatchBodyLine[] };

export type PatchParseError = { line: number; problem: string };

export const PATCH_PROBLEMS = {
  missingPath: 'missing path',
  noSections: 'no file sections',
  misplacedMove: 'Move to must follow Update File',
  addLine: 'Add File lines must start with "+"',
  emptyUpdate: 'Update File needs a hunk or Move to',
  unknownMarker: (line: string) => `unknown marker "${line}"`,
};

type Marker = { kind: 'add' | 'delete' | 'update' | 'move'; path: string };

function marker(text: string): Marker | undefined {
  const markers = [
    ['*** Add File:', 'add'],
    ['*** Delete File:', 'delete'],
    ['*** Update File:', 'update'],
    ['*** Move to:', 'move'],
  ] as const;
  for (const [prefix, kind] of markers) {
    if (text === prefix || text.startsWith(`${prefix} `)) {
      return { kind, path: text.slice(prefix.length).trim() };
    }
  }
  return undefined;
}

function addSection(sections: WorkingSection[], found: Marker, line: number): PatchParseError | undefined {
  if (found.kind === 'move') {
    const previous = sections.at(-1);
    if (previous?.kind !== 'update' || previous.line !== line - 1) {
      return { line, problem: PATCH_PROBLEMS.misplacedMove };
    }
    if (!found.path) return { line, problem: PATCH_PROBLEMS.missingPath };
    previous.moveTo = found.path;
    return undefined;
  }
  if (!found.path) return { line, problem: PATCH_PROBLEMS.missingPath };
  switch (found.kind) {
    case 'add': { sections.push({ kind: 'add', path: found.path, line, lines: [] }); break; }
    case 'delete': { sections.push({ kind: 'delete', path: found.path, line }); break; }
    case 'update': { sections.push({ kind: 'update', path: found.path, line, bodyLines: [] }); break; }
  }
  return undefined;
}

function addBody(sections: WorkingSection[], text: string, line: number): PatchParseError | undefined {
  const current = sections.at(-1);
  if (current?.kind === 'update' && text === '*** End of File') {
    current.bodyLines.push({ line, text });
    return undefined;
  }
  if (text.startsWith('*** ')) return { line, problem: PATCH_PROBLEMS.unknownMarker(text) };
  if (current?.kind === 'add') {
    if (!text.startsWith('+')) return { line, problem: PATCH_PROBLEMS.addLine };
    current.lines.push(text.slice(1));
    return undefined;
  }
  if (current?.kind === 'update') {
    current.bodyLines.push({ line, text });
    return undefined;
  }
  return { line, problem: PATCH_PROBLEMS.unknownMarker(text) };
}

function closeUpdate(sections: WorkingSection[], completed: PatchSection[], endLine?: number, interrupted = false): PatchParseError | undefined {
  const current = sections.at(-1);
  if (current?.kind !== 'update') return undefined;
  const result = parseHunks(current.bodyLines, endLine);
  if ('error' in result) return result.error;
  if (interrupted) return undefined;
  if (result.hunks.length === 0 && !current.moveTo) return { line: current.line, problem: PATCH_PROBLEMS.emptyUpdate };
  completed.push({ kind: 'update', path: current.path, line: current.line, ...(current.moveTo && { moveTo: current.moveTo }), hunks: result.hunks });
  return undefined;
}

function splitLines(text: string): string[] {
  const lines = text === '' ? [] : text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  for (let index = 0; index < lines.length; index++) {
    if ((index < lines.length - 1 || text.endsWith('\n')) && lines[index].endsWith('\r')) {
      lines[index] = lines[index].slice(0, -1);
    }
  }
  return lines;
}

function walkLine(sections: WorkingSection[], completed: PatchSection[], text: string, line: number): PatchParseError | undefined {
  const found = marker(text);
  if (found && found.kind !== 'move') {
    const error = closeUpdate(sections, completed, line);
    if (error) return error;
    const previous = sections.at(-1);
    if (previous && previous.kind !== 'update') completed.push(previous);
  }
  const error = found ? addSection(sections, found, line) : addBody(sections, text, line);
  if (!error) return undefined;
  const earlier = closeUpdate(sections, completed, line, true);
  return earlier && earlier.line < error.line ? earlier : error;
}

export function parsePatchText(text: string): { sections: PatchSection[] } | { error: PatchParseError } {
  const lines = splitLines(text);
  const start = lines[0] === '*** Begin Patch' ? 1 : 0;
  const end = lines.at(-1) === '*** End Patch' ? lines.length - 1 : lines.length;
  const sections: WorkingSection[] = [];
  const completed: PatchSection[] = [];
  for (let index = start; index < end; index++) {
    const error = walkLine(sections, completed, lines[index], index + 1);
    if (error) return { error };
  }
  const error = closeUpdate(sections, completed, end < lines.length ? end + 1 : undefined);
  if (error) return { error };
  const last = sections.at(-1);
  if (last && last.kind !== 'update') completed.push(last);
  return completed.length > 0 ? { sections: completed } : { error: { line: 1, problem: PATCH_PROBLEMS.noSections } };
}
