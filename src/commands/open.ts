import type { Command } from './types.js';

export type ParsedOpen = { external: boolean; web: boolean; target: string } | { error: string };

// Schemes a browser acts on without a `//` authority. Only `http` and `https` are viewable, so the web
// opener rejects every one of these; routing them there is what gets them reported as an invalid
// address rather than resolved as a file path and reported missing.
const OPAQUE_SCHEMES = new Set(['file', 'javascript', 'data', 'vbscript', 'about', 'blob', 'mailto', 'tel', 'sms']);

// Whether a target is written as a URL rather than a path: a scheme followed by `//` (`https://`,
// `file:///`, `ftp://`), or one of the opaque schemes above. Narrower than the URI grammar on
// purpose — a local file name like `notes:v2.md` is also a syntactically valid URI, and must still
// open as a file.
function carriesUrlScheme(target: string): boolean {
  const match = /^([a-z][a-z\d+\-.]*):/i.exec(target);
  if (!match) return false;
  return target.startsWith('//', match[0].length) || OPAQUE_SCHEMES.has(match[1].toLowerCase());
}

// Parse an `open` command line. The leading `open` keyword is stripped; the optional `external` and
// `page` keywords (in any order) are consumed; everything remaining is the target. A target written
// as a URL (see `carriesUrlScheme`), or preceded by `page`, is routed to the web opener
// (`web: true`), which accepts only http/https; otherwise it goes to the file opener. The target is
// kept verbatim (paths may contain spaces).
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
  const web = isPage || carriesUrlScheme(target);
  return { external: isExternal, web, target };
}

// Whether an `open` argument is a shell wildcard pattern (expanded to a list of files) rather than a
// single literal path. Detects the common glob metacharacters: `* ? [ ] { }`.
export function isGlobPattern(argument: string): boolean {
  return /[*?[\]{}]/.test(argument);
}

export const command: Command = {
  name: 'open',
  match: (command_) => /^open\b/i.test(command_),
  samples: ['open', 'open notes.txt'],
  run: (command, tab, managers) => managers.openFile.run(command, tab.label),
};
