export type PatchSection =
  | { kind: 'add'; path: string; line: number; lines: string[] }
  | { kind: 'delete'; path: string; line: number }
  | { kind: 'update'; path: string; line: number; moveTo?: string; bodyLines: { line: number; text: string }[] };

export type PatchParseError = { line: number; problem: string };

export const PATCH_PROBLEMS = {
  missingPath: 'missing path',
  noSections: 'no file sections',
  misplacedMove: 'Move to must follow Update File',
  addLine: 'Add File lines must start with "+"',
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

function addSection(sections: PatchSection[], found: Marker, line: number): PatchParseError | undefined {
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

function addBody(sections: PatchSection[], text: string, line: number): PatchParseError | undefined {
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

export function parsePatchText(text: string): { sections: PatchSection[] } | { error: PatchParseError } {
  const lines = splitLines(text);
  const start = lines[0] === '*** Begin Patch' ? 1 : 0;
  const end = lines.at(-1) === '*** End Patch' ? lines.length - 1 : lines.length;
  const sections: PatchSection[] = [];
  for (let index = start; index < end; index++) {
    const found = marker(lines[index]);
    const error = found ? addSection(sections, found, index + 1) : addBody(sections, lines[index], index + 1);
    if (error) return { error };
  }
  return sections.length > 0 ? { sections } : { error: { line: 1, problem: PATCH_PROBLEMS.noSections } };
}
