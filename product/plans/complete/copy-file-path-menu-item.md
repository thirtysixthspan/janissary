# File-navigator context menu: Copy file path

## Issue

In the file navigator, add a context menu item 'copy file path' that copies the absolute path
of file or files selected into the copy paste buffer.

## Complexity

3/10. One formatting helper beside the existing copy writer, one menu-table entry, one action
binding, tests, and spec/doc updates. No server changes; the app already has
`copyText` for the system clipboard.

## Goal

Right-clicking a row offers **Copy file path**, which puts the absolute path(s) on the system
clipboard as text. When the right-clicked row is part of a multi-row selection, every selected
path is copied, one per line; otherwise just the clicked row. Remote trees qualify each path
with its host, keeping the `<host>:<absolute-remote-path>` form every other remote insertion
uses. It writes the copy-paste buffer only — the app-wide file clipboard and the row marks stay
untouched, since this copy puts nothing on the Paste flow.

## Approach

The clipboard-writing helpers live in `web/src/file-navigator/file-navigator-copy.ts`, which
already carries both clipboard writes for **Copy**. Add a second, standalone helper there:

```ts
export function copyAbsolutePaths(absoluteRoot: string, relPaths: string[], remoteHost?: string): void
```

joining `${absoluteRoot}/${relPath}` (or `remoteNavigatorPath` per path for a remote tree) with
newlines and handing it to `copyText`. Nothing mutates the file navigator clipboard.

The menu table in `file-navigator-menu-items.ts` gains `copyFilePath` on
`FileNavigatorMenuActions` and one entry **Copy file path**, added to the Copy/Paste/Duplicate
group after Duplicate (it is a copy). It is omitted on the `..` row like every other entry that
names a place in the tree. The action binding in `file-navigator-menu-actions.ts` follows the
`openWith` convention: the whole selection when the clicked row is part of it
(`selection.operationPaths`), the row alone otherwise.

## Implementation steps

1. `file-navigator-copy.ts`: add `copyAbsolutePaths`.
2. `file-navigator-menu-actions.ts`: bind `copyFilePath`.
3. `file-navigator-menu-items.ts`: add the entry to the actions type and the menu group.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

In `file-navigator-copy.test.ts`:

- writes the absolute paths, newline-separated, to the system clipboard
- writes host-qualified absolute paths for a remote tree
- writes nothing (no `writeText`, no clipboard state change) for an empty list

In `file-navigator-menu-items.test.ts` (update expectations):

- ordinary file row shows `Copy file path` in the Copy group (eleven entries in four groups)
- the `..` row omits it, like Duplicate and Rename

In `FileNavigatorTab.test.tsx`:

- choosing **Copy file path** from the row context menu writes the absolute path to the system
  clipboard; with a multi-row selection containing the clicked row, one path per line

## Spec

`product/specs/file-navigator-tab.md` ("Copying, cutting, and pasting" section): a short
paragraph on the **Copy file path** context-menu entry — absolute paths, one per line, whole
selection or the clicked row, remote form, no clipboard marks.

## Out of scope

- Touching the app-wide file clipboard or cut/paste flow.
- A keyboard chord for it (the issue asks for a menu item only).
- Changing the existing **Copy** entry's system-clipboard text.
