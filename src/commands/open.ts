import type { Command } from './types.js';

export type ParsedOpen = { external: boolean; path: string } | { error: string };

// Parse an `open` command line: `open <path>` (inline) or `open external <path>` (external). The
// leading `open` keyword is stripped; an optional `external` keyword immediately after it selects the
// external surface. Everything remaining is the file path (kept verbatim, including spaces).
export function parseOpen(cmd: string): ParsedOpen {
  const rest = cmd.replace(/^open\b\s*/i, '');
  const ext = rest.match(/^external\b\s*/i);
  const external = !!ext;
  const path = (external ? rest.slice(ext![0].length) : rest).trim();
  if (!path) return { error: 'Usage: open [external] <path>' };
  return { external, path };
}

// Whether an `open` argument is a shell wildcard pattern (expanded to a list of files) rather than a
// single literal path. Detects the common glob metacharacters: `* ? [ ] { }`.
export function isGlobPattern(arg: string): boolean {
  return /[*?[\]{}]/.test(arg);
}

// Registry descriptor for command resolution (`resolveCommand` uses `match`/`name`). The behavior is
// implemented in the Controller (`runOpen`), which has the tab/serving capabilities openers need, so
// this handler is intentionally a no-op placeholder.
export const command: Command = {
  name: 'open',
  match: (cmd) => /^open\b/i.test(cmd),
  handler: () => { /* behavior lives in Controller.runOpen */ },
};
