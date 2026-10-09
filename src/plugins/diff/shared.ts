export const DIFF_PAYLOAD_SCHEMA_VERSION = 5;

// One line of a hunk. `kind` is which side git printed it on; `number` is the line's number on that
// side — the old-side number for a removed line, the new-side number for an added or context one — so
// the client renders a number per row without computing anything; and `jump` is the new-side line a
// double-click on this line opens the file at. A removed line has no new-side position, so its `jump`
// is the new-side number of the next added or context line, and a hunk whose trailing lines are all
// removed uses the hunk's last new-side number. `oldNumber` is the line's position on the original
// side — set for a context or removed line, absent for an added one, which has no position before it —
// so a row can show both sides' numbers with the blank on the side it has none.
export type DiffLine = {
  kind: 'added' | 'removed' | 'context';
  number: number;
  jump: number;
  oldNumber?: number;
  text: string;
};

// One changed region of a file, with the `@@` header's own numbers kept so the parser's arithmetic is
// checkable and the split view's two columns can each label their side.
export type DiffHunk = {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};

// One changed file. `path` is project-relative and forward-slashed; `oldPath` is set only for a
// rename; `deleted` marks a file the working tree no longer holds, so clicking its name does nothing;
// `added` marks a file that did not exist before — git answers a record with no original side by
// printing `--- /dev/null` — because an append reads as additions with no deletions and the two must
// not be told apart by counting; `binary` marks a change git reported as binary, which carries no
// hunks and whose entry opens the media tab for the file instead of an editor tab. `additions` and
// `deletions` are counted from the hunk lines.
export type DiffFile = {
  path: string;
  oldPath?: string;
  deleted?: boolean;
  added?: boolean;
  binary?: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  contextLines?: number;
  canExpandContext?: boolean;
  expandingContext?: boolean;
  contextError?: string;
};

// `loading` while a recompute runs, `done` once it settles, `not-repository` when the root is not
// inside one, and `error` when git itself failed — the reason, as one line, in `message`.
export type DiffState = 'loading' | 'done' | 'not-repository' | 'error';

// Which layout the change set renders in. `split` is the standing preference the tab opens with —
// the session saves it in the plugin's settings entry.
export type DiffPayload = {
  root: string;
  state: DiffState;
  message: string;
  split: boolean;
  files: DiffFile[];
};

// Recompute without any options.
export type RefreshIntent = Record<string, never>;

// The layout the user chose, which becomes the layout every later diff tab opens with.
export type LayoutIntent = { split: boolean };
export type ContextIntent = { path: string; fullFile?: boolean };

// Open a file at a line in an editor tab. `path` is project-relative; `line` is the line's payload
// record's own `jump`.
export type OpenIntent = { path: string; line: number };

// Open a binary file in the media tab its extension already opens.
export type OpenMediaIntent = { path: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDiffLine(value: unknown): value is DiffLine {
  return isRecord(value)
    && ['added', 'removed', 'context'].includes(value.kind as string)
    && typeof value.number === 'number'
    && typeof value.jump === 'number'
    && (value.oldNumber === undefined || typeof value.oldNumber === 'number')
    && typeof value.text === 'string';
}

function isDiffHunk(value: unknown): value is DiffHunk {
  return isRecord(value)
    && typeof value.oldStart === 'number'
    && typeof value.newStart === 'number'
    && Array.isArray(value.lines)
    && value.lines.every(isDiffLine);
}

function isDiffFile(value: unknown): value is DiffFile {
  return isRecord(value)
    && typeof value.path === 'string'
    && (value.oldPath === undefined || typeof value.oldPath === 'string')
    && (value.deleted === undefined || typeof value.deleted === 'boolean')
    && (value.added === undefined || typeof value.added === 'boolean')
    && (value.binary === undefined || typeof value.binary === 'boolean')
    && typeof value.additions === 'number'
    && typeof value.deletions === 'number'
    && (value.contextLines === undefined || (typeof value.contextLines === 'number'
      && Number.isSafeInteger(value.contextLines) && value.contextLines >= 3 && value.contextLines <= 1_000_000))
    && (value.canExpandContext === undefined || typeof value.canExpandContext === 'boolean')
    && (value.expandingContext === undefined || typeof value.expandingContext === 'boolean')
    && (value.contextError === undefined || typeof value.contextError === 'string')
    && Array.isArray(value.hunks)
    && value.hunks.every(isDiffHunk);
}

export function isDiffPayload(value: unknown): value is DiffPayload {
  return isRecord(value)
    && typeof value.root === 'string'
    && ['loading', 'done', 'not-repository', 'error'].includes(value.state as string)
    && typeof value.message === 'string'
    && typeof value.split === 'boolean'
    && Array.isArray(value.files)
    && value.files.every(isDiffFile);
}

export function isRefreshIntent(value: unknown): value is RefreshIntent {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isLayoutIntent(value: unknown): value is LayoutIntent {
  return isRecord(value) && typeof value.split === 'boolean';
}

export function isContextIntent(value: unknown): value is ContextIntent {
  return isRecord(value) && typeof value.path === 'string' && value.path.length > 0
    && (value.fullFile === undefined || typeof value.fullFile === 'boolean');
}

export function isOpenIntent(value: unknown): value is OpenIntent {
  return isRecord(value) && typeof value.path === 'string' && typeof value.line === 'number';
}

export function isOpenMediaIntent(value: unknown): value is OpenMediaIntent {
  return isRecord(value) && typeof value.path === 'string';
}
