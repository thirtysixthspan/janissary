# Keyboard file activation asks the opener registry as double-click does

Backlog: technical debt — "Make keyboard activation of a file in the navigator ask the server's opener registry exactly as double-click does, instead of sending a hardcoded edit or open."

Complexity rating: 3/10

## Goal

Double-click, Enter and Shift+Enter each called a different mix of a client-side Markdown regex and the server's opener registry. Double-click applied the Markdown inversion and asked the registry; Enter asked the registry but skipped the inversion; Shift+Enter sent `fileNavigatorOpen` with `command: 'edit'` directly, never consulting the registry. So Shift+Enter on a Markdown, video or audio file opened the text editor instead of the destination Shift+double-click reaches, contradicting the spec's key table, and every plugin declaring an `editGesture` was wrong from the keyboard.

## Approach

Extract a pure `fileActivation(path, shift)` into `web/src/file-navigator/file-activation.ts`, holding the Markdown inversion. `onRowDoubleClick` and both keyboard actions (`open` from Enter, Space and →; `edit` from Shift+Enter) call `actions.openFile(path, fileActivation(path, shift))`, which goes through `useFileNavigatorOpener.open` and the `fileNavigatorOpeners` request. `editFile` stays only for the context menu's explicit Edit entries, so it leaves the keyboard's `NavActions` and the tab's `FileNavigatorActions`.

## Implementation steps

1. Add `file-activation.ts`; use it in `use-file-navigator-row-events.ts`.
2. `useFileNavigatorKeyDown.ts`: map `open` and `edit` through `fileActivation`; drop `editFile` from its actions.
3. `FileNavigatorTab.tsx` and `file-navigator-menu-actions.ts`: stop passing and returning `editFile`.

## Tests

- New `web/src/file-navigator/file-activation.test.ts`: default and shifted routes, and the Markdown inversion.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`: the Shift+Enter case that pinned the old behaviour on `README.md` now runs on `src/index.ts`; Enter and Shift+Enter on `README.md` send `edit` and `open`; with a request-capable client, Shift+Enter on a video asks `fileNavigatorOpeners` with `edit: true` and sends the command the registry answers.
- Double-click and Open-with cases, `web/src/file-navigator/file-navigator-keys.test.ts` and `src/file-navigator/openers-for-row.test.ts` keep passing.

## Out of scope

- Moving the Markdown inversion into the Markdown opener's own declaration on the server.

## Specs and docs

- `product/specs/file-navigator-tab.md`: → and Enter/Space open a file as double-click does, including the plain-text editor for Markdown.
- `documentation/user-documentation/tab-types/file-navigator.md`: the key table says Enter and Shift+Enter match double-click and Shift+double-click.
- `help.md`: does not describe the navigator keys; no edit.
