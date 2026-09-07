import { useEffect, useRef, useState } from 'react';
import type { TabView } from '@shared/protocol';

// The unexecuted text sitting in each tab's command bar, keyed by tab label. A tab with no draft
// has no entry, so "never typed" and "typed and then cleared" are the same state.
export type CommandDrafts = Map<string, string>;

// Owns the draft store for the whole app. It has to live above the command bar: only one bar is
// mounted at a time, it unmounts whenever a view tab is focused, and the same instance is reused
// across agent tabs — so the bar can hold neither other tabs' drafts nor its own across a switch.
// Drafts of tabs that have closed are dropped, since agent names come from a pool of unused names
// and a later agent can be handed a closed tab's name.
export function useCommandDrafts(tabs: TabView[]): CommandDrafts {
  const drafts = useRef<CommandDrafts>(new Map());

  useEffect(() => {
    const open = new Set(tabs.map((tab) => tab.label));
    for (const label of drafts.current.keys()) {
      if (!open.has(label)) drafts.current.delete(label);
    }
  }, [tabs]);

  return drafts.current;
}

// Binds one command bar's value to `key`'s draft. Every edit writes through to the store, so
// nothing has to be saved on the way out, and a `key` different from the one last rendered swaps
// in that tab's own draft — React's "adjusting state when a prop changes" pattern, which keeps the
// textarea itself in place rather than rebuilding it around a new mount.
export function useCommandDraft(key: string, drafts: CommandDrafts) {
  const [value, setValue] = useState(() => drafts.get(key) ?? '');
  const shownKey = useRef(key);

  if (shownKey.current !== key) {
    shownKey.current = key;
    setValue(drafts.get(key) ?? '');
  }

  const write = (next: string) => {
    if (next === '') drafts.delete(key);
    else drafts.set(key, next);
    setValue(next);
  };

  return { value, setValue: write };
}
