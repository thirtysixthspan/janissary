import type { FileNavigatorRow } from '@shared/protocol';
import type { ContextMenuItem } from './ContextMenu';

// What the file navigator's context menu can do. Every action takes the right-clicked row rather
// than the selection, because right-clicking deliberately leaves the selection alone.
export type FileNavigatorMenuActions = {
  open: (row: FileNavigatorRow) => void;
  openWith: (row: FileNavigatorRow) => void;
  copy: (row: FileNavigatorRow) => void;
  paste: (row: FileNavigatorRow) => void;
  rename: (row: FileNavigatorRow) => void;
  remove: (row: FileNavigatorRow) => void;
  newFile: () => void;
  newDirectory: () => void;
};

// The menu's entries for one row, grouped as the caller draws them (a separator between groups).
// An entry that doesn't apply is omitted rather than shown greyed out, so the menu's height varies
// with context: the ".." row has nowhere to open, open-with, or rename to, and Paste only exists
// once something is on the clipboard. Pure, so the visibility rules are testable without rendering.
//
// `contributed` is the one entry that acts on the whole selection rather than the clicked row: a tab
// plugin's own, offered when every selected row is a file of its claimed types. It is drawn in a
// group of its own above Copy, labelled with whatever the plugin declared, and this function knows
// nothing else about it — the navigator never learns what kind of files it is looking at.
export function fileNavigatorMenuItems(
  row: FileNavigatorRow,
  clipboardArmed: boolean,
  actions: FileNavigatorMenuActions,
  contributed?: { label: string; onActivate: () => void } | null,
): ContextMenuItem[][] {
  const parentRow = row.path === '..';
  const openGroup: ContextMenuItem[][] = parentRow ? [] : [[
    { label: 'Open', onActivate: () => actions.open(row) },
    { label: 'Open with', onActivate: () => actions.openWith(row) },
  ]];
  const pasteEntry: ContextMenuItem[] = clipboardArmed
    ? [{ label: 'Paste', onActivate: () => actions.paste(row) }]
    : [];
  const renameEntry: ContextMenuItem[] = parentRow
    ? []
    : [{ label: 'Rename', onActivate: () => actions.rename(row) }];

  const contributedGroup: ContextMenuItem[][] = contributed ? [[contributed]] : [];

  return [
    ...openGroup,
    ...contributedGroup,
    [{ label: 'Copy', onActivate: () => actions.copy(row) }, ...pasteEntry],
    [...renameEntry, { label: 'Delete', onActivate: () => actions.remove(row) }],
    [
      { label: 'New file', onActivate: actions.newFile },
      { label: 'New folder', onActivate: actions.newDirectory },
    ],
  ];
}
