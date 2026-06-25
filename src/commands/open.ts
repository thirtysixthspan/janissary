import type { Command } from './types.js';

export type ParsedOpen = { external: boolean; path: string } | { error: string };

// Parse an `open` command line: `open <path>` (inline) or `open external <path>` (external). The
// leading `open` keyword is stripped; an optional `external` keyword immediately after it selects the
// external surface. Everything remaining is the file path (kept verbatim, including spaces).
export function parseOpen(command_: string): ParsedOpen {
  const rest = command_.replace(/^open\b\s*/i, '');
  const extension = rest.match(/^external\b\s*/i);
  const isExternal = !!extension;
  const path = (isExternal ? rest.slice(extension[0].length) : rest).trim();
  if (!path) return { error: 'Usage: open [external] <path>' };
  return { external: isExternal, path };
}

// Whether an `open` argument is a shell wildcard pattern (expanded to a list of files) rather than a
// single literal path. Detects the common glob metacharacters: `* ? [ ] { }`.
export function isGlobPattern(argument: string): boolean {
  return /[*?[\]{}]/.test(argument);
}

// Registry descriptor for command resolution (`resolveCommand` uses `match`/`name`). The behavior is
// implemented in the Controller (`runOpen`), which has the tab/serving capabilities openers need, so
// this handler is intentionally a no-op placeholder.
export const command: Command = {
  name: 'open',
  match: (command_) => /^open\b/i.test(command_),
  handler: () => { /* behavior lives in Controller.runOpen */ },
};
