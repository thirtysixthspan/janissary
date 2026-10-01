import type { TabView } from '@shared/protocol';
import { isCloseCommand, parseClose } from '@shared/commands/parse-close';
import { matchesLabelOrAlias } from '@shared/tab/name-match';
import { closeQuitsApp } from '@shared/tab/placement';

// What a typed `close` / `exit` would do, read and matched exactly as the server's `close` command
// does, so the command bar can put the right dialog in front of it: the save guard for a tab it would
// close, the quit confirmation for a close that would quit the app. The target is the active tab for
// a bare close and the named tab for `close <name>` — either spelling quits when its target is the
// last non-docked tab, and either one is confirmed first.
export type TypedClose =
  | { kind: 'close'; index: number }
  | { kind: 'quit' }
  | { kind: 'none' };

export function classifyTypedClose(text: string, tabs: TabView[], activeTab: number): TypedClose {
  const trimmed = text.trim();
  if (!isCloseCommand(trimmed)) return { kind: 'none' };
  const parsed = parseClose(trimmed);
  const index = 'name' in parsed
    ? tabs.findIndex((tab) => matchesLabelOrAlias(tab, parsed.name))
    : activeTab;
  if (index === -1) return { kind: 'none' };
  return closeQuitsApp(tabs, index) ? { kind: 'quit' } : { kind: 'close', index };
}
