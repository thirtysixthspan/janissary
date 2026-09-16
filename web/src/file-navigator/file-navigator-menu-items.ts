import type { FileNavigatorRow } from '@shared/protocol';
import type { ContextMenuItem } from '../shared/ContextMenu';

// What the file navigator's context menu can do. Every action takes the right-clicked row rather
// than the selection, because right-clicking deliberately leaves the selection alone — except
// Delete and Commit to origin, both of which act on the whole selection when the clicked row is part
// of it — Delete because that matches the Finder/Explorer convention for a destructive multi-file
// action, and Commit to origin because one commit carrying every selected file is the point of it.
export type FileNavigatorMenuActions = {
  open: (row: FileNavigatorRow) => void;
  edit: (row: FileNavigatorRow) => void;
  openWith: (row: FileNavigatorRow) => void;
  copy: (row: FileNavigatorRow) => void;
  paste: (row: FileNavigatorRow) => void;
  duplicate: (row: FileNavigatorRow) => void;
  rename: (row: FileNavigatorRow) => void;
  remove: (row: FileNavigatorRow) => void;
  commitToOrigin: (row: FileNavigatorRow) => void;
  newFile: () => void;
  newDirectory: () => void;
};

// The menu's entries for one row, grouped as the caller draws them (a separator between groups).
// An entry that doesn't apply is omitted rather than shown greyed out, so the menu's height varies
// with context: the ".." row has nowhere to open, open-with, rename, or duplicate to, and Paste only exists
// once something is on the clipboard. Pure, so the visibility rules are testable without rendering.
//
// `contributed` is the one entry that acts on the whole selection rather than the clicked row: a tab
// plugin's own, offered when every selected row is a file of its claimed types. It is drawn in a
// group of its own above Copy, labelled with whatever the plugin declared, and this function knows
// nothing else about it — the navigator never learns what kind of files it is looking at.
//
// `hasBranch` is the same kind of caller-supplied visibility fact as `clipboardArmed`: the tree only
// shows a branch when its root sits in a git repository, and outside one there is nothing to commit
// to — so `Commit to origin` is omitted exactly where the header's commit button is.
export function fileNavigatorMenuItems(
  row: FileNavigatorRow,
  clipboardArmed: boolean,
  actions: FileNavigatorMenuActions,
  contributed?: { label: string; onActivate: () => void } | null,
  hasBranch = false,
): ContextMenuItem[][] {
  const parentRow = row.path === '..';
  const editEntry: ContextMenuItem[] = row.dir
    ? []
    : [{ label: 'Edit', onActivate: () => actions.edit(row) }];
  const openGroup: ContextMenuItem[][] = parentRow ? [] : [[
    { label: 'Open', onActivate: () => actions.open(row) },
    ...editEntry,
    { label: 'Open with', onActivate: () => actions.openWith(row) },
  ]];
  const pasteEntry: ContextMenuItem[] = clipboardArmed
    ? [{ label: 'Paste', onActivate: () => actions.paste(row) }]
    : [];
  const renameEntry: ContextMenuItem[] = parentRow
    ? []
    : [{ label: 'Rename', onActivate: () => actions.rename(row) }];
  // Duplicate sits with Copy and Paste because it is a copy, but unlike Paste it never depends on
  // the clipboard. The ".." row has no place in this tree to duplicate into.
  const duplicateEntry: ContextMenuItem[] = parentRow
    ? []
    : [{ label: 'Duplicate', onActivate: () => actions.duplicate(row) }];

  // Commit to origin joins Rename and Delete rather than opening a group of its own: it is the third
  // entry here that changes something permanently, and the ".." row is not in the tree to commit.
  const commitEntry: ContextMenuItem[] = parentRow || !hasBranch
    ? []
    : [{ label: 'Commit to origin', onActivate: () => actions.commitToOrigin(row) }];

  const contributedGroup: ContextMenuItem[][] = contributed ? [[contributed]] : [];

  return [
    ...openGroup,
    ...contributedGroup,
    [{ label: 'Copy', onActivate: () => actions.copy(row) }, ...pasteEntry, ...duplicateEntry],
    [...renameEntry, { label: 'Delete', onActivate: () => actions.remove(row) }, ...commitEntry],
    [
      { label: 'New file', onActivate: actions.newFile },
      { label: 'New folder', onActivate: actions.newDirectory },
    ],
  ];
}
