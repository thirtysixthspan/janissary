import type { Command } from './types.js';

export type ParsedOpen = { external: boolean; web: boolean; target: string } | { error: string };

// Parse an `open` command line. The leading `open` keyword is stripped; the optional `external` and
// `page` keywords (in any order) are consumed; everything remaining is the target. A target with an
// http/https scheme, or preceded by `page`, is routed to the web opener (`web: true`); otherwise it
// goes to the file opener. The target is kept verbatim (paths may contain spaces).
export function parseOpen(command_: string): ParsedOpen {
  let rest = command_.replace(/^open\b\s*/i, '');
  let isExternal = false;
  let isPage = false;
  // Consume optional keywords in any order.
  let changed = true;
  while (changed) {
    changed = false;
    const extMatch = rest.match(/^external\b\s*/i);
    if (extMatch) { isExternal = true; rest = rest.slice(extMatch[0].length); changed = true; }
    const pageMatch = rest.match(/^page\b\s*/i);
    if (pageMatch) { isPage = true; rest = rest.slice(pageMatch[0].length); changed = true; }
  }
  const target = rest.trim();
  if (!target) return { error: 'Usage: open [external] [page] <target>' };
  const web = isPage || /^https?:\/\//i.test(target);
  return { external: isExternal, web, target };
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
