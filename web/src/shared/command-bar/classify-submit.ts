import type { TabView } from '@shared/protocol';
import { isCloseCommand, parseClose } from '@shared/commands/parse-close';
import { matchesLabelOrAlias } from '@shared/tab/name-match';
import { closeQuitsApp } from '@shared/tab/placement';
import { overlayClaimedByCommand } from '../contributed-overlays';
import { isBareOpener } from './bare-openers';

// What a line typed into any command bar does, decided before anything is sent. Both bars ask this —
// the agent tab's own chain and a plugin tab's bar — so a word the application claims means the same
// thing wherever it was typed, and `quit` cannot reach the server from one of them and not the other.
export type CommandBarVerdict =
  // Opens an overlay rather than running anything: a bare word in the table below, or one a plugin
  // claims. `command` is the word to hand to `openCommandBarOverlay`.
  | { kind: 'overlay'; command: string }
  // Quits the application, so it opens the quit confirmation instead of running.
  | { kind: 'confirm-quit' }
  // Closes one named or active tab that is not the last, which only the client can guard.
  | { kind: 'confirm-close'; index: number }
  // Nothing client-side: the caller offers the line onward, which for a plugin bar means the host
  // decides whether the application claims it.
  | { kind: 'run' };

// Read and matched exactly as the server's `close` command does, so the command bar can put the right
// dialog in front of it: the quit confirmation for a close that would quit the app, and the save guard
// for one it would not. The target is the active tab for a bare close and the named tab for
// `close <name>` — either spelling quits when its target is the last non-docked tab.
function classifyClose(trimmed: string, tabs: TabView[], activeTab: number, sourceTab?: string): CommandBarVerdict {
  if (!isCloseCommand(trimmed)) return { kind: 'run' };
  const parsed = parseClose(trimmed);
  const index = 'name' in parsed
    ? tabs.findIndex((tab) => matchesLabelOrAlias(tab, parsed.name))
    : sourceTab === undefined ? activeTab : tabs.findIndex((tab) => tab.label === sourceTab);
  // A close naming a tab that is not open is not a close at all, so the line runs and the server
  // answers for it. Swallowing it here would report nothing for a command the user did type.
  if (index === -1) return { kind: 'run' };
  return closeQuitsApp(tabs, index) ? { kind: 'confirm-quit' } : { kind: 'confirm-close', index };
}

export function classifyCommandBarSubmit(
  text: string, tabs: TabView[], activeTab: number, sourceTab?: string,
): CommandBarVerdict {
  const trimmed = text.trim().toLowerCase();
  const command = trimmed.replace(/^\//, '');
  if (command === 'quit') return { kind: 'confirm-quit' };
  if (isBareOpener(trimmed) || overlayClaimedByCommand(trimmed)) return { kind: 'overlay', command: trimmed };
  return classifyClose(command, tabs, activeTab, sourceTab);
}
