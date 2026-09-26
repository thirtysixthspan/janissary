import type { TabView } from '@shared/protocol';
import { isCloseCommand, parseClose } from '@shared/commands/parse-close';
import { matchesLabelOrAlias } from '@shared/tab/name-match';
import { closeQuitsApp } from '@shared/tab/placement';

// The position of the tab a typed `close` / `exit` would close, read and matched exactly as the
// server's `close` command does, so the command bar can put the save guard in front of it: the
// active tab for a bare close, the named tab for `close <name>`. -1 for any other command, a name no
// tab carries, or a named tab whose close quits the app — that goes to the server unguarded.
export function typedCloseIndex(text: string, tabs: TabView[], activeTab: number): number {
  const trimmed = text.trim();
  if (!isCloseCommand(trimmed)) return -1;
  const parsed = parseClose(trimmed);
  if (!('name' in parsed)) return activeTab;
  const index = tabs.findIndex((tab) => matchesLabelOrAlias(tab, parsed.name));
  return index !== -1 && closeQuitsApp(tabs, index) ? -1 : index;
}
