export const SEARCH_PAYLOAD_SCHEMA_VERSION = 1;

// One match, self-describing: its own project-relative path and line number so the row's header
// needs nothing from its neighbours, and the block of text around the match. `above` and `below`
// hold the two context lines either side and are shorter than two when the match sits near the start
// or end of a file — they are clipped, never padded.
export type SearchMatch = {
  path: string;
  line: number;
  above: string[];
  match: string;
  below: string[];
};

// `searching` while a scan runs, `done` once it settles, `error` when it fails. The rows already
// delivered stay on screen through all three, so a scan that fails partway keeps what it found.
export type SearchState = 'searching' | 'done' | 'error';

export type SearchPayload = {
  query: string;
  include: string;
  exclude: string;
  regex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
  state: SearchState;
  // The reason a failed scan gives, and empty otherwise.
  message: string;
  rows: SearchMatch[];
};

export type SearchIntent = { query: string; include: string; exclude: string; regex: boolean; matchCase: boolean; wholeWord: boolean };
export type OpenIntent = { path: string; line: number };
export type ClearIntent = Record<string, never>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isMatch(value: unknown): value is SearchMatch {
  return isRecord(value)
    && typeof value.path === 'string'
    && typeof value.line === 'number'
    && isStringArray(value.above)
    && typeof value.match === 'string'
    && isStringArray(value.below);
}

export function isSearchPayload(value: unknown): value is SearchPayload {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.include === 'string'
    && typeof value.exclude === 'string'
    && typeof value.regex === 'boolean'
    && typeof value.matchCase === 'boolean'
    && typeof value.wholeWord === 'boolean'
    && ['searching', 'done', 'error'].includes(value.state as string)
    && typeof value.message === 'string'
    && Array.isArray(value.rows)
    && value.rows.every((row) => isMatch(row));
}

export function isSearchIntent(value: unknown): value is SearchIntent {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.include === 'string'
    && typeof value.exclude === 'string'
    && typeof value.regex === 'boolean'
    && typeof value.matchCase === 'boolean'
    && typeof value.wholeWord === 'boolean';
}

export function isOpenIntent(value: unknown): value is OpenIntent {
  return isRecord(value) && typeof value.path === 'string' && typeof value.line === 'number';
}

export function isClearIntent(value: unknown): value is ClearIntent {
  return isRecord(value) && Object.keys(value).length === 0;
}
