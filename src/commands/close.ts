import type { Command } from './types.js';

export type ParsedClose =
  | { target: 'active' }
  | { target: 'page'; number: number }
  | { error: string };

// Parse a `close` command: bare `close` closes the active tab; `close page <n>` closes the
// numbered page tab; anything else is a usage error.
export function parseClose(command_: string): ParsedClose {
  const rest = command_.replace(/^close\b\s*/i, '').trim();
  if (!rest) return { target: 'active' };
  const pageMatch = rest.match(/^page\b\s*(\d+)\s*$/i);
  if (pageMatch) return { target: 'page', number: Number(pageMatch[1]) };
  return { error: 'Usage: close [page <n>]' };
}

// Behavior lives in the Controller (`closeTab`), which disposes the tab's owned resources (shell,
// ACP session, browser, terminals, workspace). This is the registry descriptor for resolution.
export const command: Command = {
  name: 'close',
  match: (command_) => /^close\b/i.test(command_),
};
