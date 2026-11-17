export type PatchHunkLine = { kind: 'context' | 'remove' | 'add'; text: string };
export type PatchHunk = { anchor?: string; lines: PatchHunkLine[]; endOfFile: boolean };
export type PatchBodyLine = { line: number; text: string };

export const HUNK_PREFIX_PROBLEM = 'hunk lines must start with " ", "-", or "+"';

function startHunk(text: string): PatchHunk {
  const raw = text.slice(2);
  const anchor = raw.startsWith(' ') ? raw.slice(1) : raw;
  return { ...(anchor && { anchor }), lines: [], endOfFile: false };
}

function hunkLine(text: string): PatchHunkLine | undefined {
  const kind = text.startsWith(' ') ? 'context' : text.startsWith('-') ? 'remove' : text.startsWith('+') ? 'add' : undefined;
  return kind ? { kind, text: text.slice(1) } : undefined;
}

function invalidLine(line: number) {
  return { error: { line, problem: HUNK_PREFIX_PROBLEM } };
}

function missingFirstLine(current: PatchHunk | undefined, text: string): boolean {
  return current !== undefined && current.lines.length === 0 && !hunkLine(text);
}

export function parseHunks(bodyLines: PatchBodyLine[], endLine?: number):
  { hunks: PatchHunk[] } | { error: { line: number; problem: string } } {
  const hunks: PatchHunk[] = [];
  let current: PatchHunk | undefined;
  let headerLine: number | undefined;
  for (const body of bodyLines) {
    if (missingFirstLine(current, body.text)) {
      return invalidLine(body.line);
    }
    if (body.text.startsWith('@@')) {
      current = startHunk(body.text);
      headerLine = body.line;
      hunks.push(current);
      continue;
    }
    if (body.text === '*** End of File' && current) {
      current.endOfFile = true;
      current = undefined;
      continue;
    }
    const parsed = hunkLine(body.text);
    if (!parsed || (!current && hunks.length > 0)) {
      return invalidLine(body.line);
    }
    if (!current) {
      current = { lines: [], endOfFile: false };
      hunks.push(current);
    }
    current.lines.push(parsed);
  }
  if (current && current.lines.length === 0) {
    return invalidLine(endLine ?? headerLine!);
  }
  return { hunks };
}
