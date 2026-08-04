# File navigator selection and context menu

**Complexity: 5/10** — the keyboard half reuses existing pure helpers and the menu borrows its keyboard, highlight, and dismissal behavior from the opener picker, leaving a wire-contract change to `FileOpenerChoice`, a server change in `openersForRow`, and two file splits as the real work.

The file navigator's selection semantics differ depending on whether you drive it with the mouse or the keyboard. A pointer can build a multi-row selection (Shift-click for a range, Cmd/Ctrl-click to toggle), but the keyboard cannot — every arrow, Home/End, PageUp/PageDown, and type-ahead collapses the selection to a single cursor row. `product/specs/file-navigator-tab.md` states the gap outright: "Shift+Arrow range extension and Cmd/Ctrl+A are not supported." At the same time, copy, cut, and paste exist only as keyboard chords: the spec closes that section with "Copying, cutting, and pasting have no route through the mouse or a menu — keyboard only."

This plan closes both halves. Shift+Arrow extends a range from the anchor exactly the way Shift-click already does, so pointer and keyboard produce the same selection from the same two rows. Cmd/Ctrl+A selects the cursor row's siblings. And a right-click context menu — the first one in this codebase — gives the mouse a route to open, copy, paste, rename, delete, and the two creation actions.

The menu deliberately leaves Cut out. Drag-and-drop is already the mouse route for moving a file, so a second one would be redundant; Cmd/Ctrl+X stays the keyboard route and is unchanged.

## Design decisions

**Shift+Arrow recomputes the range from the anchor.** Shift+ArrowUp and Shift+ArrowDown move the cursor one visible row and set the selection to every row between the fixed anchor and the new cursor. Reversing direction shrinks the range rather than growing it, which is what VS Code's Explorer does and, more importantly, is exactly what `rangeSelection` already computes for a Shift-click. One helper serves both input routes, so the two can't drift.

**Only the two arrows extend.** Shift+Home, Shift+End, Shift+PageUp, and Shift+PageDown are not part of this version and keep their current behavior of collapsing the selection to the cursor.

**With no cursor, Shift+Arrow starts from the top row.** Shift+ArrowDown from the empty state anchors on the first row and selects through the second, matching the spec's existing rule that a cleared tree "resumes navigating from the top row... `↓` selects its second row."

**Shift+Arrow clamps at both ends.** At the first row Shift+ArrowUp does nothing, and at the last row Shift+ArrowDown does nothing. No wrap, and the selection is left untouched rather than being collapsed.

**Cmd/Ctrl+A selects the cursor row's siblings.** Every visible row sharing the cursor's parent directory becomes selected, and the cursor stays where it is. Expanded subtrees below a sibling are not pulled in — only the sibling row itself.

**Cmd/Ctrl+A with no cursor, or with the cursor on `..`, does nothing.** The shortcut is strictly relative to a chosen row. Nothing is selected and nothing is cleared.

**The tree captures Cmd/Ctrl+A while focused.** `useWindowKeys.ts` currently binds that chord to the task picker. A focused navigator takes it for itself, joining the existing captured set (undo/redo, `Cmd+N`, `Cmd+R`, `Cmd+C`/`X`/`V`); every other Ctrl/Cmd chord still falls through to the window.

**The context menu carries eight entries in four groups.** In order, with separators between groups: Open and Open with; Copy and Paste; Rename and Delete; New file and New folder.

**"Open" runs the default opener; "Open with" always shows the chooser.** Open does what a double-click does today. Open with forces the existing `Open <name> with` picker to appear listing every available choice, even for a file that has one registered opener and would normally skip the chooser entirely.

**Forcing the chooser is a server change, not a client one.** `src/file-navigator/openers-for-row.ts:16-17` returns `{ command, choices: [] }` — an empty choice list — whenever `openerForExtension` claims the extension, so the client has nothing to render a forced chooser from. The RPC gains an optional flag that suppresses the single-command shortcut and returns the full list instead.

**A forced chooser lists three entries.** The registered opener's own action first, labelled `Open as <opener.name>` (`Open as markdown`, `Open as image`) from `Opener.name` at `src/openers/types.ts:32`, then the two existing fallbacks `Edit as text` and `Open externally`. A file with no registered opener already returns exactly those two fallbacks, so for that case the forced chooser and the ordinary one are identical.

**`FileOpenerChoice['command']` widens to include `'open'`.** It is `'edit' | 'open external'` today (`src/protocol.ts:42`); the registered opener's entry needs `'open'`. `FileOpenerResolution['command']` already permits all three, so only the choice type changes. This is additive — no existing choice value is removed or re-meaninged.

**Right-clicking never changes the selection.** The menu opens for the clicked row and its entries act on that row, whether or not it is part of the current selection. The visible selection is left exactly as it was.

**Unavailable entries are hidden, not greyed out.** Paste is absent when the clipboard is empty. Rename and the two Open entries are absent on the `..` row. The menu's height varies with context.

**The menu is keyboard-navigable and dismissible three ways.** Arrow keys move between entries and Enter activates one. Escape, a click outside, or choosing an entry closes it and returns keyboard focus to the tree.

**The menu is built as a general primitive, not a navigator-specific overlay.** A reusable positioned-menu component owns placement, dismissal, and keyboard navigation; the navigator supplies the item list. Later consumers (a transcript menu, a tab-strip menu) get it without a rewrite.

## What already exists (reuse, don't rebuild)

| What | Where | How this plan uses it |
|---|---|---|
| `rangeSelection(state, rows, path)` — anchor-to-path range, `..` filtered out | `web/src/useFileNavigatorSelection.ts` | Shift+Arrow calls it with the row the cursor is moving to. No new range logic. |
| `replaceSelection`, `toggleSelection`, `selectFromPointer` | `web/src/useFileNavigatorSelection.ts` | Unchanged; Shift+Arrow joins them as a sibling selection transition. |
| `normalizeOperationPaths(rows, selected)` — drops `..`, duplicates, and descendants of selected directories | `web/src/useFileNavigatorSelection.ts` | Already applied to whatever the selection holds, so a Shift+Arrow or Cmd+A selection needs no special handling before delete, copy, or move. |
| `handleFileNavigatorKey(rows, selected, key, shiftKey, pageSize)` — pure, returns a next selection plus an optional action | `web/src/file-navigator-keys.ts` | The arrow branches gain the shift case. Its purity is why this is testable without rendering. |
| `handleTreeChord(key, shiftKey, rows, selected, handlers)` — the Ctrl/Cmd chord dispatcher | `web/src/file-navigator-chords.ts` | Gains the `a` case, keeping `FileNavigatorTab.tsx`'s `onKeyDown` a single branch for the whole ctrl/meta case. |
| App-wide clipboard module with `getClipboardSnapshot` and `subscribeClipboard` | `web/src/file-navigator-clipboard.ts` | The menu reads the snapshot to decide whether to show Paste. No second clipboard. |
| `useFileNavigatorOpener` — `open(path, edit)`, its `pending` chooser state, and the `fileNavigatorOpeners` RPC call | `web/src/useFileNavigatorOpener.ts:11` | Open calls `open` unchanged. Open with adds a second entry point that sets the same `pending` state. |
| `FileOpenerPicker` / `FileNavigatorOpenerOverlay` — the `Open <name> with` chooser, already arrow-key and Enter driven, keyed on `choice.command` | `web/src/FileOpenerPicker.tsx` | Open with reuses it as-is. Its `key={choice.command}` stays unique because the forced list holds three distinct commands. |
| `openersForRow(root, relPath, edit)` — the pure resolution function, already extracted from the manager to respect the line limit | `src/file-navigator/openers-for-row.ts:12` | Gains the forced-chooser branch. Purity is preserved: it still only reads the opener registry. |
| `openerForExtension(extension)` returning an `Opener` with a `name` | `src/openers/index.ts:25`, `src/openers/types.ts:32` | Supplies the `Open as <name>` label without core learning what any particular opener is. |
| Method allowlist validation for client messages | `src/client-message.ts:22` (`fileNavigatorOpeners: true`) | An added optional param needs no validator change — the allowlist checks the method name only. |
| `useFileNavigatorDelete`, `useFileNavigatorPaste`, `useFileNavigatorRename` | `web/src/` | The menu's Delete, Paste, and Rename entries call these, so every confirmation dialog and conflict flow is identical to the keyboard route. |
| `newFileCommand`, `newDirectoryCommand`, `newFileTargetDir`, `newDirectoryTargetPath` | `web/src/file-navigator-new-file.ts` | New file and New folder reuse the header buttons' existing handlers unchanged. |
| The overlay slot pattern — every navigator dialog rendered from one component | `web/src/FileNavigatorOverlays.tsx` | The menu mounts here alongside the drag ghost, conflict dialogs, opener overlay, and search popup. |
| Window-level chord table with Cmd/Ctrl+A bound to the task picker | `web/src/useWindowKeys.ts` | The conflict this plan has to resolve, by capturing the chord in the tree. |
| Row class composition for selected, cursor, drop-target, and clipboard marks | `web/src/file-navigator-row-class.ts` | No change; a menu is not a row state. |
| Existing picker CSS classes (`.picker`, `.picker-title`, `.picker-row`, `.picker-row.selected`) | `web/src/theme.css:491-507` | The menu's visual language, so it reads like the rest of the app rather than a new widget, and its active-item highlight. |
| Arrow/Enter/Escape navigation over a list with a `selected` index | `web/src/useFileNavigatorOpener.ts:31-41` | The `ContextMenu`'s keyboard handling, copied rather than reinvented. |
| Outside-click dismissal via `onBlur` on the overlay | `web/src/FileSearchPopup.tsx:54`, `web/src/InlineEditInput.tsx:29` | How the menu closes on an outside click — no document-level listener, of which `web/src` currently has none. |
| `React.MouseEvent`'s own `preventDefault` on the native `contextmenu` event | browser platform | Suppressing the OS menu; nothing custom needed. |

## Proposed changes

### Shift+Arrow range extension

`handleFileNavigatorKey` in `web/src/file-navigator-keys.ts` currently ignores `shiftKey` for the arrows and returns a single next-selection path. Give its outcome type an optional flag marking the result as a range extension rather than a collapse, set when `shiftKey` is true for ArrowUp or ArrowDown. The clamp lives here: at index 0 with ArrowUp, or the last index with ArrowDown, return an outcome that leaves the selection alone.

`useFileNavigatorKeyDown` in `web/src/useFileNavigatorKeyDown.ts` currently calls `selection.replace(result.selection)` for every navigation key. Branch on the new flag: an extension calls a new `extend` callback on the selection hook, a collapse keeps calling `replace`. Nothing else in that handler changes, and the existing `e.preventDefault()`/`stopPropagation()` for `NAV_KEYS` already covers the shifted variants.

`useFileNavigatorSelection` gains an `extend(path)` callback that applies `rangeSelection` to the current state and stores the result. It is a thin wrapper — the range math stays in the pure exported helper, and `extend` exists so the component never reaches into `setState` itself. The empty-state case falls out of `rangeSelection`'s existing behavior of defaulting its start to `state.anchor ?? state.cursor ?? path`; the arrow logic supplies the top row as the cursor when there is none, matching plain ArrowDown.

### Cmd/Ctrl+A sibling selection

`web/src/useFileNavigatorSelection.ts` is 192 lines, so a new helper cannot go in it — that would breach the 200-line `max-lines` rule, and the guidelines' only sanctioned answer is extraction. Put `siblingSelection(state, rows)` in a new `web/src/file-navigator-siblings.ts` instead. It returns the selection holding every visible row that shares the cursor row's parent, with cursor and anchor unchanged, and returns `state` untouched when `state.cursor` is null or `'..'`.

Parent identity is derived by depth, the way `parentOf` does at `web/src/file-navigator-keys.ts:18` ("walking backward for the first row at a shallower depth"), not by string-splitting paths — a sibling is any row at the cursor's own depth between its parent and the next row shallower than it. That is what keeps an expanded subtree beneath a sibling out of the result, since those rows are deeper.

`handleTreeChord` in `web/src/file-navigator-chords.ts` gains an `a` case calling a new `selectSiblings` handler, and `ChordHandlers` gains that member. Returning true from that case is what stops the chord from reaching the window's task-picker binding, since `useFileNavigatorKeyDown` already calls `preventDefault` and `stopPropagation` for any handled chord.

`FileNavigatorTab.tsx` wires `selectSiblings` to a new callback on the selection hook, matching how `copySelection` and `cutSelection` are wired today.

### The context menu primitive

A new `web/src/ContextMenu.tsx` renders a positioned menu from a list of items, each carrying a label and an activation callback, with separators between item groups. It does not know what a file is, and it takes no navigator types — that is what makes it reusable. Unavailable entries are the caller's concern: the caller passes only the items that should appear, which is what "hidden, not greyed" means in practice.

Three of its four behaviors are already solved in this codebase and should be copied rather than invented:

- **Keyboard navigation** is the `pending.selected` index pattern in `useFileNavigatorOpener.onKeyDown` (`web/src/useFileNavigatorOpener.ts:31-41`) — ArrowUp and ArrowDown clamp the index, Enter activates it, Escape closes. The menu needs the same four cases over its own item list.
- **Highlighting the active item** is `.picker-row.selected` (`web/src/theme.css:504`), already applied by index in `FileOpenerPicker.tsx:18`.
- **Outside-click dismissal** is `onBlur` on the focused menu container, the way `FileSearchPopup.tsx:54` (`onBlur={onClose}`) and `InlineEditInput.tsx:29` already close. There is no document-level click listener anywhere in `web/src`, and adding one here would be the only one — `onBlur` gets the same result with no listener to register, remove, or leak, and it hands focus back to the tree for free.

Only placement is genuinely new: absolute positioning at the pointer's viewport point, shifted back inside the window when the menu would overflow the right or bottom edge.

**Deliberate ceiling.** The primitive is built generic (the human's explicit choice) but ships with exactly one consumer, so it stays flat: no submenus, no icons, no checkable items, no portal. A second consumer that needs any of those extends it then, with a real case to design against.

A companion pure module, `web/src/file-navigator-menu-items.ts`, builds the navigator's item list from the clicked row, the clipboard snapshot, and a set of action callbacks. It decides which of the eight entries survive for that row — no Open entries or Rename on `..`, no Paste with an empty clipboard — and groups them. Keeping this pure is what makes the visibility rules testable without rendering a menu.

`FileNavigatorRowView.tsx` gains an `onContextMenu: (e: React.MouseEvent) => void` prop alongside its existing `onClick`, `onDoubleClick`, and `onMouseDown` props, wired onto the same row `<div>`. The handler prevents the browser's native menu, records the clicked row and the pointer position, and leaves the selection alone.

That state is one `useState` holding the pending menu (row plus position), or null — it lives in the row-events module below rather than in a hook file of its own, since a single piece of state with one setter and one clear does not need a module to hold it. It mirrors `useFileNavigatorOpener`'s `pending` state at `web/src/useFileNavigatorOpener.ts:9`. `FileNavigatorOverlays.tsx` renders the menu when that state is set and restores tree focus on close through the `focusTree` callback it already receives and already uses for `DeleteFileDialog`.

**File-size constraint.** `web/src/FileNavigatorTab.tsx` is 187 lines; adding the hook call, the action callbacks, and the row prop pushes it past 200. Extract the row event handlers that are already there — `onRowMouseDown`, `onRowClick`, `onRowDoubleClick` (`FileNavigatorTab.tsx:80-104`) plus the new context-menu handler — into a new `web/src/use-file-navigator-row-events.ts`, and pass the returned handler bundle to `FileNavigatorRowView`. This is the same extraction move `useFileNavigatorKeyDown.ts` and `FileNavigatorOverlays.tsx` already represent, both of which say so in their own header comments.

Menu actions route to the handlers that already exist rather than duplicating them: Open and Open with through `useFileNavigatorOpener`, Copy through `setClipboard`, Paste through `useFileNavigatorPaste`, Rename through `useFileNavigatorRename.begin`, Delete through `useFileNavigatorDelete.request`, and the two creation entries through `createNewFile` and `createNewDirectory`. Every action targets the clicked row rather than the selection, consistent with the decision that right-click does not change what is selected.

### Forcing the opener chooser

This one crosses the wire, so it lands in a definite order: protocol first, then server, then client. Each step keeps typecheck green on its own.

**Protocol.** In `src/protocol.ts`, widen `FileOpenerChoice` (line 42) so `command` also accepts `'open'`, and add an optional `all?: boolean` to the `fileNavigatorOpeners` client message params (line 306). Both are additive, so no other message shape moves. The comment above `FileOpenerResolution` (lines 43-46) describes the two-outcome contract and needs a sentence about the forced third case, per the principle that a behavior change updates its documentation in the same change.

**Server.** `openersForRow` at `src/file-navigator/openers-for-row.ts:12` takes the new flag as a fourth parameter. When it is true and an opener claims the extension, return `{ choices: [...] }` with no `command`: the opener's own action (`command: 'open'`, label `Open as ${opener.name}`), then `Edit as text`, then `Open externally`. When it is true and no opener claims the extension, return exactly what the function returns today — the same two fallbacks. When it is false, behavior is completely unchanged. Thread the flag through `FileNavigatorManager.openers` (`src/file-navigator/manager.ts:192`), `fileNavigatorOpeners` (`src/controller/file-navigator.ts:137`), and the RPC case in `src/message-handler-file-navigator.ts:85`. `src/client-message.ts` needs no edit — its allowlist checks method names, not params.

Note that a `video`-style opener declaring `editGesture: 'open external'` (`src/openers/types.ts:35`) gets the same uniform three entries in a forced chooser. The gesture inversion only governs what shift-activation resolves to, which is the non-forced path and stays untouched.

**Client.** `useFileNavigatorOpener` gains an `openWith(path)` alongside `open` rather than a third boolean argument on `open` — `open`'s existing `edit` boolean already reads ambiguously at call sites, and a second one would be worse. `openWith` sends `all: true` and always sets `pending` from the returned choices. Keep the existing no-`client.request` fallback branch (`useFileNavigatorOpener.ts:12-15`) in mind: with no request support there is no chooser to show, so `openWith` falls back to the plain `open` command exactly as `open` does today.

### Spec and CSS

`product/specs/file-navigator-tab.md` needs four edits in the same change, per the docs-move-with-the-code principle: the Keyboard interactions table gains Shift+↑/↓ and Cmd/Ctrl+A rows; the sentence "Shift+Arrow range extension and Cmd/Ctrl+A are not supported" is replaced with their actual semantics; the Mouse interactions table gains a right-click row; and "Copying, cutting, and pasting have no route through the mouse or a menu — keyboard only" becomes an accurate statement about Copy and Paste having a menu route while Cut stays keyboard-only. The paragraph listing chords the tree captures for itself also needs Cmd/Ctrl+A added.

The Mouse interactions table's double-click rows also need a pointer to the new Open with route, and the "If a file has no registered opener, double-clicking it presents a chooser" paragraph needs the forced-chooser case added beside it.

`web/src/theme.css` gains the menu's own classes. Build them on the picker block at `theme.css:491-507` (`.picker`, `.picker-title`, `.picker-row`, `.picker-row.selected`, `.picker-row:hover`) so the menu reads as the same widget family; the menu's own additions are absolute positioning from a supplied point and a separator rule.

## Landing order

The three parts are independent except for the opener chooser's own internal order. Land them as: (1) Shift+Arrow, (2) Cmd/Ctrl+A, (3) the protocol/server/client opener change, (4) the `ContextMenu` primitive and its item builder, (5) the navigator wiring and row-events extraction, (6) the spec edits. Step 5 depends on 3 and 4; nothing else has a hard ordering constraint. Do the `FileNavigatorTab.tsx` extraction as the first commit of step 5, before adding anything to that file, so the line limit is never breached in an intermediate state.

## Tests

Following the colocated `*.test.ts(x)` convention: server tests in the `server` project, web tests in the `client` project.

`web/src/file-navigator-keys.test.ts` — Shift+ArrowDown and Shift+ArrowUp return an extension outcome with the expected next cursor; Shift+ArrowUp at index 0 and Shift+ArrowDown at the last index leave the selection unchanged; unshifted arrows still collapse, so the existing cases stay green.

`web/src/useFileNavigatorSelection.test.ts` (exists) — `extend` grows a range from the anchor, shrinks it when the direction reverses, and omits `..`.

`web/src/file-navigator-siblings.test.ts` (new) — `siblingSelection` returns the cursor's siblings without pulling in an expanded subtree beneath one of them, returns the state untouched for a null cursor and for `..`, and leaves cursor and anchor in place.

`web/src/file-navigator-chords.test.ts` (new — `handleTreeChord` has no direct test today) — `a` dispatches `selectSiblings` and returns true, so the chord never reaches the window's task-picker binding at `useWindowKeys.ts:139`. Cover the existing chords in the same file while it is being created.

`src/file-navigator/openers-for-row.test.ts` (exists) — with the flag set, a file whose extension has a registered opener returns three choices and no `command`, led by the `Open as <name>` entry; with the flag set and no registered opener, the result is unchanged from today's two fallbacks; with the flag clear, every existing case still returns its single `command` and empty `choices`, including the `editGesture` inversion.

`web/src/file-navigator-menu-items.test.ts` — the eight entries appear in the specified order and grouping for an ordinary file row; Paste is absent with an empty clipboard and present with a non-empty one; Open, Open with, and Rename are absent on `..`.

`web/src/ContextMenu.test.tsx` (new) — renders items and separators; arrow keys move the highlight and Enter activates the highlighted item; Escape, a blur, and activating an item each close it; the menu shifts back inside the window rather than overflowing when opened near an edge.

`web/src/FileNavigatorTab.test.tsx` — right-clicking a row opens the menu and leaves the existing selection untouched, including when the clicked row is not selected; choosing Delete opens the ordinary delete confirmation; choosing Open with shows the chooser for a file that has a registered opener; focus returns to the tree after the menu closes.

## Out of scope

- **Cut in the context menu.** Cmd/Ctrl+X remains the only cut route; drag-and-drop remains the mouse route for moving files.
- **Shift+Home, Shift+End, Shift+PageUp, Shift+PageDown.** These keep collapsing the selection to the cursor.
- **Cmd/Ctrl+A selecting anything other than the cursor's siblings** — no whole-tree select-all, and no fallback selection when the cursor is null or on `..`.
- **A second consumer of the new `ContextMenu`.** The transcript, tab strip, and editor get no menu in this change, even though the primitive is built to serve them later.
- **Greyed-out menu entries.** Unavailable entries are omitted, so no disabled-item styling or behavior is needed.
- **Changing what right-click does to the selection.** No "right-click selects the row first" behavior, and no empty-space root menu below the last row.
- **Undo/redo entries in the menu.** Cmd+Z and Cmd+Shift+Z stay keyboard-only.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff` after each change.

Manual check: open a navigator with `files`, expand a directory so the tree has several visible rows at more than one depth, then:

1. Click a row, hold Shift and press ↓ twice — three rows are selected. Press Shift+↑ once — the range shrinks back to two. Press Shift+↑ repeatedly at the top row — nothing changes and nothing is cleared.
2. Press Escape to clear, then Shift+↓ — the first two rows are selected.
3. Put the cursor on a file inside an expanded subdirectory and press Cmd+A — only that directory's own children are selected, not the whole tree. Press Escape, then Cmd+A again — nothing is selected and the task picker does not open.
4. Right-click a row that is not part of the current selection — the menu opens, and the previous selection is still highlighted underneath it. Press ↓ then Enter on Open with — the `Open <name> with` chooser appears even for a file whose type has a registered opener.
5. Right-click the `..` row — Open, Open with, and Rename are absent from the menu.
6. Copy a row through the menu, then right-click elsewhere — Paste is now present; before the copy it was not. Click outside the menu — it closes and the tree takes keyboard focus, so ↓ moves the cursor immediately.
