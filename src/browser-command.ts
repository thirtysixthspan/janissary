// Parser for the `browser` command plus the two helpers the ACP tool loop needs
// (`extractBrowserCommand` / `BROWSER_PRIMER`), mirroring `parseConnectionCommand`
// (src/connections.ts) and the `db` equivalents in src/db.ts. Pure — no I/O. The host
// (src/cli.tsx) performs the actual Playwright actions against the tab's browser.

import type { BrowserParsed } from './types.js';

const USAGE =
  'Usage: browser <open [name] [--headed]|list|use <id>|goto <url>|eval <js>|shot|content|close [id]|window close <id>>';

// First-position subcommand keywords, exported for tab completion.
export const BROWSER_SUBCOMMANDS = [
  'open',
  'list',
  'use',
  'goto',
  'eval',
  'shot',
  'content',
  'close',
  'window',
];

/** Parse a `browser ...` command. Pure — performs no I/O. */
export function parseBrowserCommand(input: string): BrowserParsed {
  const rest = input.trim().replace(/^browser\b\s*/i, '').trim();
  if (!rest) return { error: USAGE };

  const [actionRaw, ...tail] = rest.split(/\s+/);
  const action = actionRaw.toLowerCase();
  // The argument text after the action verb, with original spacing preserved.
  const arg = rest.slice(actionRaw.length).trim();

  switch (action) {
    case 'open': {
      const tokens = tail;
      const headed = tokens.some((t) => t === '--headed' || t === '-H');
      const name = tokens.find((t) => !t.startsWith('-'));
      return { action: 'open', name, headed };
    }
    case 'list':
      return { action: 'list' };
    case 'use':
      if (!tail[0]) return { error: 'Usage: browser use <id>' };
      return { action: 'use', id: tail[0] };
    case 'goto':
      if (!arg) return { error: 'Usage: browser goto <url>' };
      return { action: 'goto', url: arg };
    case 'eval':
      if (!arg) return { error: 'Usage: browser eval <js>' };
      return { action: 'eval', js: arg };
    case 'shot':
      return { action: 'shot' };
    case 'content':
      return { action: 'content' };
    case 'close':
      // `browser close <id>` is an alias for `browser window close <id>`; bare
      // `browser close` closes the current window.
      if (tail[0]) return { action: 'closeWindow', id: tail[0] };
      return { action: 'close' };
    case 'window':
      if (tail[0]?.toLowerCase() !== 'close' || !tail[1]) {
        return { error: 'Usage: browser window close <id>' };
      }
      return { action: 'closeWindow', id: tail[1] };
    default:
      return { error: USAGE };
  }
}

/**
 * Pull a proposed `browser ...` command out of an agent reply, if present. Scans
 * bottom-up (the primer asks for the command on the last line) and tolerates a
 * surrounding code fence or a leading `$ `/`> ` prompt marker — same shape as
 * `extractDbCommand`.
 */
export function extractBrowserCommand(text: string): string | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim();
    if (/^browser\s+(open|list|use|goto|eval|shot|content|close|window)\b/i.test(line)) return line;
  }
  return null;
}

// Primer injected into an ACP agent so it can drive a real browser through the autonomous
// tool loop. It exposes a deliberately simplified surface — window/headless/mode management
// is handled by the host, which auto-launches the tab's browser (headless) and auto-opens a
// window on first use.
export const BROWSER_PRIMER = [
  'This host CLI can also drive a real web browser via `browser` commands. Syntax:',
  '  browser goto <url>     # navigate to a URL (a browser/window opens automatically)',
  '  browser content        # return the current page\'s rendered text',
  '  browser eval <js>      # run JavaScript in the page and return the result',
  'To read a web page, end your reply with exactly one `browser` command on its own final',
  'line (no code fence, nothing after it). The host runs it and returns the output to you,',
  'so you can issue further commands. When the task is done, reply with the final answer and',
  'NO trailing command.',
].join('\n');
