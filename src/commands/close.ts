import type { Command } from './types.js';

export type ParsedClose =
  | { target: 'active' }
  | { target: 'page'; number: number }
  | { target: 'tabname'; name: string }
  | { error: string };

// Parse a `close` command: bare `close` closes the active tab (quitting the app if it is the
// only tab); `close page <n>` closes the numbered page tab; `close <name>` closes the tab with
// that label. `exit` is an alias of `close`.
export function parseClose(command_: string): ParsedClose {
  const rest = command_.replace(/^(?:close|exit)\b\s*/i, '').trim();
  if (!rest) return { target: 'active' };
  const pageMatch = rest.match(/^page\b\s*(\d+)\s*$/i);
  if (pageMatch) return { target: 'page', number: Number(pageMatch[1]) };
  return { target: 'tabname', name: rest.trim() };
}

export const command: Command = {
  name: 'close',
  match: (command_) => /^(?:close|exit)\b/i.test(command_),
  run: (command_, tab, managers) => {
    const parsed = parseClose(command_);
    if ('error' in parsed) { managers.tab.append(tab.label, { input: command_, output: parsed.error }); return; }
    if (parsed.target === 'page') {
      const pageTab = managers.tab.tabs.findIndex((t) => t.page?.number === parsed.number);
      if (pageTab === -1) { managers.tab.append(tab.label, { input: command_, output: `No page numbered ${parsed.number}.` }); return; }
      managers.tab.closeTab(pageTab);
    } else if (parsed.target === 'tabname') {
      const nameTab = managers.tab.tabs.findIndex((t) => t.label.toLowerCase() === parsed.name.toLowerCase());
      if (nameTab === -1) { managers.tab.append(tab.label, { input: command_, output: `No tab named "${parsed.name}".` }); return; }
      managers.tab.closeTab(nameTab);
    } else {
      managers.tab.closeTab(tab.index);
    }
  },
};
