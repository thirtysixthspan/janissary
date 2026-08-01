import type { FileNavigatorDetail } from '../types.js';

type ParsedArgs = {
  inLabel?: string; dock: 'left' | 'right' | null; details?: FileNavigatorDetail; target: string;
};

// One leading keyword clause: the pattern that recognizes it, and where its captured value lands.
// A clause only matches while its slot is still empty, so each is consumed at most once.
const CLAUSES: { pattern: RegExp; apply: (parsed: ParsedArgs, value: string) => void }[] = [
  {
    pattern: /^in\s+(\S+)\b\s*/i,
    apply: (parsed, value) => { parsed.inLabel = value; },
  },
  {
    pattern: /^on\s+(left|right)\b\s*/i,
    apply: (parsed, value) => { parsed.dock = value.toLowerCase() as 'left' | 'right'; },
  },
  {
    pattern: /^with\s+(name|size|modified|permissions)\b\s*/i,
    apply: (parsed, value) => { parsed.details = value.toLowerCase() as FileNavigatorDetail; },
  },
];

// True while the clause at `index` has not been consumed yet.
function unfilled(parsed: ParsedArgs, index: number): boolean {
  if (index === 0) return parsed.inLabel === undefined;
  if (index === 1) return parsed.dock === null;
  return parsed.details === undefined;
}

// Parses the argument tail of a `files [left|right] [path]` / `files in <label> [on <side>]` /
// `files with <mode>` command. Consumes leading `in <label>` / `on <left|right>` /
// `with <name|size|modified|permissions>` clauses (any order, each at most once), then falls back
// to the bare `left`/`right` keyword if neither dock clause was used. Whatever's left over is the
// path target — including a `with` followed by anything other than the four mode words, so a
// directory named `with` stays reachable as a path.
export function parseFileNavigatorArgs(rest: string): ParsedArgs {
  const parsed: ParsedArgs = { dock: null, target: '' };
  let cursor = rest;

  for (let matched = true; matched;) {
    matched = false;
    for (const [index, clause] of CLAUSES.entries()) {
      if (!unfilled(parsed, index)) continue;
      const match = clause.pattern.exec(cursor);
      if (!match) continue;
      clause.apply(parsed, match[1]);
      cursor = cursor.slice(match[0].length);
      matched = true;
      break;
    }
  }

  if (parsed.inLabel === undefined && parsed.dock === null) {
    const keyword = /^(left|right)\b\s*/i.exec(cursor);
    if (keyword) { parsed.dock = keyword[1].toLowerCase() as 'left' | 'right'; cursor = cursor.slice(keyword[0].length); }
  }
  parsed.target = cursor.trim();
  return parsed;
}
