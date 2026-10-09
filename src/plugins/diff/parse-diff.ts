import type { DiffFile, DiffHunk, DiffLine } from './shared.js';

// The pure half of the diff: git's unified diff output in, the payload's file records out. No
// process, no filesystem, and no path resolution beyond the prefix the caller supplies.
//
// The parser reads a file's paths from its `---`/`+++` lines rather than its `diff --git` line,
// because a path with a space in it is ambiguous in the latter and is not ambiguous in the former:
// git pads a spaced path with a trailing tab, and quotes a non-ASCII one. `rename from`/`rename to`
// are consulted only for a pure rename, which carries no `---`/`+++` lines at all.

type PendingFile = {
  oldPath: string;
  newPath: string;
  oldIsNull: boolean;
  newIsNull: boolean;
  renamedFrom?: string;
  renamedTo?: string;
  deleted: boolean;
  binary: boolean;
  hunks: DiffHunk[];
};

type ParseOptions = {
  // The repo-relative prefix of the diffed root, removed from every path so the records come back
  // relative to the root the tab shows. Empty when the root is the repository root.
  prefix?: string;
  // The path to record, for an output that cannot name the file: an untracked file's `--no-index`
  // diff carries only its basename in its `+++` line.
  path?: string;
};

// `@@ -oldStart,oldCount +newStart,newCount @@`. The counts default to 1, which is what git omits
// them for.
const HUNK_HEADER = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/;

const ESCAPES: Record<string, number> = { n: 10, t: 9, r: 13, '"': 34, '\\': 92 };

function unquote(raw: string): string {
  if (raw.length < 2 || !raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const body = raw.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      // Escaped octal sequences are the bytes of a UTF-8 path, so the unescaped characters are
      // encoded to bytes the same way and the whole string is decoded once at the end.
      bytes.push(...new TextEncoder().encode(ch));
      continue;
    }
    const escape = body[++i];
    if (escape === undefined) break;
    const octal = escape + body[i + 1] + body[i + 2];
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      i += 2;
      continue;
    }
    bytes.push(ESCAPES[escape] ?? escape.codePointAt(0) ?? 0);
  }
  return Buffer.from(bytes).toString('utf8');
}

// One path from a `---` or `+++` line: the value after the marker, its padding tab dropped, its
// quotes decoded, and its `a/` or `b/` side prefix removed. `/dev/null` is answered as such.
function sidePath(raw: string): string {
  const value = raw.endsWith('\t') ? raw.slice(0, -1) : raw;
  if (value === '/dev/null') return value;
  const path = unquote(value);
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}

function stripPrefix(path: string, prefix: string): string {
  return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function pendingFile(): PendingFile {
  return { oldPath: '', newPath: '', oldIsNull: false, newIsNull: false, deleted: false, binary: false, hunks: [] };
}

// The two sides of a `Binary files a/x and b/y differ` line: `Binary files ` and ` differ` stripped,
// then split on the last ` and `, so a path containing one keeps its own tail. Greedy, because the
// ambiguity is git's own and quoting is its answer to it.
function binarySides(line: string): { old: string; new: string } | null {
  const rest = line.slice('Binary files '.length, line.endsWith(' differ') ? -' differ'.length : undefined);
  const sides = /^(.+) and (.+)$/.exec(rest);
  return sides ? { old: sidePath(sides[1]), new: sidePath(sides[2]) } : null;
}

// The hunk's lines, numbered as they are walked. `jump` is filled in a second pass: a removed line
// has no new-side position of its own, so it borrows the next added or context line's.
// A removed line has no new-side position of its own, so it borrows one: the next added or context
// line, else the previous one, and for a hunk that holds neither — a pure deletion — the line above
// where the hunk begins, clamped to the file's first line. Every answer is a line that exists.
function assignJumps(lines: DiffLine[], oldStart: number): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.kind !== 'removed') {
      line.jump = line.number;
      continue;
    }
    const next = lines.slice(i + 1).find((candidate) => candidate.kind !== 'removed');
    if (next) {
      line.jump = next.number;
      continue;
    }
    const previous = lines.slice(0, i).findLast((candidate) => candidate.kind !== 'removed');
    line.jump = previous ? previous.number : Math.max(1, oldStart - 1);
  }
}

// One line of the hunk as a record, and the two sides' counters advanced past it. The two sides
// advance on their own: only a line the original side holds moves its counter, and only a line the new
// side holds moves the other — an added line exists on one side alone, so it must not shift the
// numbers of anything printed after it. A `\ No newline` marker is not a line and answers null.
function stepLine(raw: string, walk: { old: number; next: number }): DiffLine | null {
  if (raw.startsWith('\\')) return null;
  const kind = raw[0] === '+' ? 'added' : raw[0] === '-' ? 'removed' : 'context';
  const line: DiffLine = {
    kind,
    number: kind === 'removed' ? walk.old : walk.next,
    // An added line has no position on the original side, so it carries no `oldNumber`; the other two
    // kinds do, and the unified and split gutters each need them.
    ...(kind !== 'added' && { oldNumber: walk.old }),
    jump: 0,
    text: raw.slice(1),
  };
  walk.old += kind === 'added' ? 0 : 1;
  walk.next += kind === 'removed' ? 0 : 1;
  return line;
}

function hunkLines(oldStart: number, newStart: number, body: string[]): DiffLine[] {
  const walk = { old: oldStart, next: newStart };
  const lines = body
    .map((raw) => stepLine(raw, walk))
    .filter((line): line is DiffLine => line !== null);
  assignJumps(lines, oldStart);
  return lines;
}

function finish(file: PendingFile, options: ParseOptions): DiffFile | null {
  const prefix = options.prefix ?? '';
  const lines = file.hunks.flatMap((hunk) => hunk.lines);
  const rawPath = file.renamedTo ?? (file.newIsNull ? file.oldPath : file.newPath);
  if (rawPath === '' || rawPath === '/dev/null') return null;
  const path = stripPrefix(rawPath, prefix);
  const oldPath = file.renamedFrom ?? (file.oldIsNull || file.newIsNull || file.oldPath === file.newPath ? undefined : file.oldPath);
  return {
    path,
    ...(oldPath !== undefined && oldPath !== path && { oldPath: stripPrefix(oldPath, prefix) }),
    ...(file.deleted && { deleted: true }),
    // A record with no original side — git answers it with `--- /dev/null` — is a file that did not
    // exist, which the header names as added. An append reads as additions with no deletions, so the
    // flag is the only honest way to tell the two apart.
    ...(file.oldIsNull && { added: true }),
    ...(file.binary && { binary: true }),
    additions: lines.filter((line) => line.kind === 'added').length,
    deletions: lines.filter((line) => line.kind === 'removed').length,
    hunks: file.hunks,
  };
}

// One line of the diff that is not hunk content, applied to the file being read. Answers a `@@`
// header's two start lines, so the caller can open a hunk; every other header line is consumed.
function readHeaderLine(file: PendingFile, line: string): { oldStart: number; newStart: number } | null {
  if (line.startsWith('rename from ')) { file.renamedFrom = unquote(line.slice('rename from '.length)); return null; }
  if (line.startsWith('rename to ')) { file.renamedTo = unquote(line.slice('rename to '.length)); return null; }
  if (line.startsWith('deleted file mode')) { file.deleted = true; return null; }
  if (line.startsWith('Binary files ')) {
    file.binary = true;
    // A tracked binary change prints no `---`/`+++` lines at all, so its two paths live only here.
    const sides = binarySides(line);
    if (sides) {
      file.oldIsNull = sides.old === '/dev/null';
      file.newIsNull = sides.new === '/dev/null';
      file.oldPath = sides.old;
      file.newPath = sides.new;
    }
    return null;
  }
  if (line.startsWith('--- ')) {
    const value = sidePath(line.slice(4));
    file.oldIsNull = value === '/dev/null';
    file.oldPath = value;
    return null;
  }
  if (line.startsWith('+++ ')) {
    const value = sidePath(line.slice(4));
    file.newIsNull = value === '/dev/null';
    file.newPath = value;
    return null;
  }
  const header = HUNK_HEADER.exec(line);
  return header ? { oldStart: Number(header[1]), newStart: Number(header[3]) } : null;
}

export function parseDiff(output: string, options: ParseOptions = {}): DiffFile[] {
  const lines = output.split('\n');
  // The output ends with a newline, so the split leaves one empty element behind that is not a line
  // of the diff. Pop it before the walk, or it reads as an empty context line on the last hunk.
  if (lines.at(-1) === '') lines.pop();
  const files: DiffFile[] = [];
  let file = pendingFile();
  let hunk: DiffHunk | null = null;
  let body: string[] = [];

  const closeHunk = (): void => {
    if (hunk) hunk.lines = hunkLines(hunk.oldStart, hunk.newStart, body);
    hunk = null;
    body = [];
  };

  const closeFile = (): void => {
    closeHunk();
    const finished = finish(file, options);
    if (finished) files.push(finished);
    file = pendingFile();
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      closeFile();
      // Remembered as the fallback name for a record that prints no `---`/`+++` lines of its own — a
      // mode-only change, the one kind git names only here, since a pure rename names itself through
      // `rename to`. Last resort rather than primary source, because git does not quote a spaced path
      // in this line and splitting it below is a heuristic.
      const sides = line.slice('diff --git '.length).split(' b/');
      file.oldPath = sidePath(sides[0] ?? '');
      file.newPath = sidePath(sides[1] ?? sides[0] ?? '');
      continue;
    }
    // Inside a hunk, only its own content lines belong to it: a space, a `+`, a `-`, a `\` marker, or
    // an empty line. Anything else closes the hunk and is read as a header again.
    if (hunk) {
      if (line === '' || line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line.startsWith('\\')) {
        body.push(line);
        continue;
      }
      closeHunk();
    }
    const header = readHeaderLine(file, line);
    if (header === null) continue;
    hunk = { oldStart: header.oldStart, newStart: header.newStart, lines: [] };
    file.hunks.push(hunk);
  }
  closeFile();

  // An output that cannot name its own file — an untracked file's `--no-index` diff carries only its
  // basename — takes the caller's path instead. Built without an `oldPath` key rather than with an
  // undefined one: the host validates a published payload with `isJsonCompatible`, which answers
  // false for a property whose value is `undefined`, so an explicit undefined would refuse the tab.
  const forcedPath = options.path;
  if (forcedPath === undefined) return files;
  return files.map(({ oldPath: _ignored, ...entry }) => ({ ...entry, path: forcedPath }));
}
