# Keyboard activation uses the opener registry

Backlog: technical debt — "Make keyboard activation of a file in the navigator ask the server's opener registry exactly as double-click does, instead of sending a hardcoded edit or open."

Complexity rating: 5/10 — a pure client-side extraction plus two call-site changes, with the wrong-behavior test that pins the current keyboard path to update. No server or protocol change, no new architecture.

## Goal

Every way of activating a file row in the file navigator resolves through the server's opener registry, so the keyboard reaches the same destination double-click does.

Today `onRowDoubleClick` in `web/src/file-navigator/use-file-navigator-row-events.ts` holds a Markdown regex and calls `actions.openFile(row.path, MARKDOWN_EXTENSION.test(row.path) !== shiftKey)`, which reaches `useFileNavigatorOpener.open` and its `fileNavigatorOpeners` request. The keyboard path in `web/src/file-navigator/useFileNavigatorKeyDown.ts` maps `open: (path) => actions.openFile(path, false)` (no Markdown inversion) and `edit: actions.editFile`, and `editFile` in `web/src/file-navigator/file-navigator-menu-actions.ts` sends `fileNavigatorOpen` with `command: 'edit'` directly, never consulting the registry.

The consequences are two, and both are already documented as the intended behavior:

- `Enter` on a Markdown row opens the rendered preview, where double-click opens the plain-text editor.
- `Shift+Enter` on a video or audio row reaches the plain-text editor, where Shift+double-click hands the file to the configured player. `Shift+Enter` on a Markdown row sends `edit`, where Shift+double-click sends `open`.

`product/specs/file-navigator-tab.md` already states that `Shift+Enter` "mirrors Shift+double-click, including its image, Markdown, and video destinations"; the code is what drifted.

## Approach

One pure module holds the gesture rule, and three call sites read it instead of restating it:

- `web/src/file-navigator/file-activation.ts` (new) exports `fileActivation(path, shift)`, the Markdown inversion the double-click handler already applies, as a pure function.
- `use-file-navigator-row-events.ts` imports it and drops its local `MARKDOWN_EXTENSION`; `onRowDoubleClick` calls `actions.openFile(row.path, fileActivation(row.path, shiftKey))`.
- `useFileNavigatorKeyDown.ts` maps both navigation actions through it: `open: (path) => actions.openFile(path, fileActivation(path, false))` and `edit: (path) => actions.openFile(path, fileActivation(path, true))`. `NavActions` loses `editFile`, and `FileNavigatorActions` stops exporting it, so `createFileNavigatorActions` keeps the helper for the context menu's explicit **Edit** entries only — the spec describes that entry as reaching the plain-text editor and the image editor, not as a second Shift+double-click.

`openFile` already takes `(path, edit)` and already routes through the registry, so no signature changes and no new request.

## Implementation steps

1. Add `web/src/file-navigator/file-activation.ts` with the `MARKDOWN_EXTENSION` regex and `fileActivation(path, shift)`, carrying the comment that explains why a Markdown row inverts the gesture.
2. Rewire `use-file-navigator-row-events.ts` onto it.
3. Rewire the two navigation actions in `useFileNavigatorKeyDown.ts`, drop `editFile` from `NavActions`, and drop it from the `actions` object `FileNavigatorTab.tsx` passes.
4. Drop `editFile` from the `FileNavigatorActions` type and the returned object in `file-navigator-menu-actions.ts`, and stop destructuring it in `FileNavigatorTab.tsx`. `menuActions.edit` keeps calling it.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/file-navigator/file-activation.test.ts` (new): the plain activation of `notes.md` and `notes.markdown` is the edit gesture and the shifted one is not, the extension test is case-insensitive, `index.ts` is the reverse, and a name that merely contains `.md` (`a.md.txt`) is not a Markdown row.
- `web/src/file-navigator/FileNavigatorTab.test.tsx`: replace the case that pins `Shift+Enter` on `README.md` to `command: 'edit'` with four — `Shift+Enter` on a source row still sends `edit`, `Shift+Enter` on a Markdown row sends `open`, `Enter` on a Markdown row sends `edit`, and `Shift+Enter` on a video row with a mocked `fileNavigatorOpeners` reply asks with `edit: true` and sends the reply's `command` (`open external`). The last one is the case the send-only fake clients cannot reach: they exercise `useFileNavigatorOpener`'s no-`request` fallback instead of the registry reply.
- `web/src/file-navigator/file-navigator-keys.test.ts`, `src/file-navigator/openers-for-row.test.ts` and the existing double-click, Open-with and multi-image cases in `FileNavigatorTab.test.tsx` keep passing unchanged.

## Out of scope

- The context menu's **Edit** entry, which stays a direct `edit` command.
- The multi-image fan-out in `menuActions.open`, which is only offered for images and so agrees with the inverted rule already.
- Any server-side change: `openersForRow` already answers both gestures correctly, and the keyboard simply stopped asking.

## Specs and docs

- `product/specs/file-navigator-tab.md`: the `Enter` / `Space` key-table row states that activating a file mirrors double-click, including its Markdown destination; the surrounding prose notes that every activation — mouse or keyboard — resolves through the opener registry.
- `product/specs/open.md`: the list of existing senders of `edit <path>` no longer names the navigator's Shift-activation, and the video, audio and PDF gesture sections say the gesture is the one Shift+double-click and Shift+Enter both use.
- `documentation/user-documentation/tab-types/file-navigator.md`: the `Shift+Enter` row says it mirrors Shift+double-click.
- `documentation/user-documentation/tab-types/editor.md`: the `Shift+Enter` sentence no longer promises an editor for every file.
- `help.md`: its `Shift+Enter` row already reads "File: edit it (mirrors Shift+double-click)", which is the behavior this restores; no edit.
