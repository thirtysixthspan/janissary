// How `close` reads what was typed, kept free of runtime imports so the web client can load it
// through the `@shared` alias: the command bar resolves a named close itself to put the save guard
// in front of it, and must read the text exactly as the server command does.

export type ParsedClose =
  | { target: 'active' }
  | { target: 'tabname'; name: string }
  | { error: string };

export function isCloseCommand(command_: string): boolean {
  return /^(?:close|exit)\b/i.test(command_);
}

// Parse a `close` command: bare `close` closes the active tab (quitting the app if it is the
// only tab); `close <name>` closes the tab with that label or display alias. `exit` is an alias of `close`.
export function parseClose(command_: string): ParsedClose {
  const rest = command_.replace(/^(?:close|exit)\b\s*/i, '').trim();
  if (!rest) return { target: 'active' };
  return { target: 'tabname', name: rest.trim() };
}
