import type { ContextMenuItem } from '../shared/ContextMenu';
import type { DefaultMenuEntry } from '@shared/protocol';

export const OPEN_URL_LABEL = 'Open this URL';

const WEB_URL = /^https?:\/\/\S+$/i;

// The selection as a web address, or null when it is anything else. Only an explicit http/https
// scheme counts — the same test `open` applies before it treats an argument as a web address — so a
// bare domain or a sentence that merely contains a link is left as plain text.
export function selectionUrl(text: string): string | null {
  const candidate = text.trim();
  if (!WEB_URL.test(candidate)) return null;
  try {
    return new URL(candidate).host ? candidate : null;
  } catch {
    return null;
  }
}

export type SelectionEntryActions = {
  openUrl: (url: string) => void;
  runContributed: (label: string) => void;
};

// The menu's final group: entries that act on what is selected rather than on the clipboard. Open
// this URL is decided here on the client, so it shows the moment the menu opens; the plugins'
// entries follow it in the order the server gave them, once their reply arrives.
export function selectionEntries(
  selectionText: string, contributed: readonly DefaultMenuEntry[], actions: SelectionEntryActions,
): ContextMenuItem[] {
  const url = selectionUrl(selectionText);
  const openEntry: ContextMenuItem[] = url === null
    ? []
    : [{ label: OPEN_URL_LABEL, onActivate: () => { actions.openUrl(url); } }];
  return [
    ...openEntry,
    ...contributed.map(({ label }) => ({ label, onActivate: () => { actions.runContributed(label); } })),
  ];
}
