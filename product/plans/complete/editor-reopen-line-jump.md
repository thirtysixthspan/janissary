# Re-opening an editor tab with a line leaves the cursor where it was

**Complexity: 3/10** — one new field on the editor view, a one-line server change in the duplicate-open branch, and one small client hook wired into the editor tab. No other open path changes.

## Bug

Re-opening a file that already has an editor tab with a `:line` suffix focuses the existing tab but leaves its cursor where it was. The spec (`product/specs/editor-tab.md`) says: "If the new open request includes a line number, the existing tab's cursor moves to that line."

## Root cause

The server does its half. The duplicate branch of `openEditorTab` (`src/tab/openers.ts`) writes `existing.editor.line = view.line` and re-broadcasts, so the new line reaches the client. The client then drops it. `editor.line` has two readers there and both run only on a tab's first load:

- `useEditorFile`'s load effect passes `editor.line - 1` to `api.load`, but its dependencies are `editor.url`, `editor.name` and `editor.sync`, and it returns early once a buffer exists.
- `EditorTab`'s initial-scroll effect reads `editor.line` only to choose `center` over `nearest`, behind the `initialScrollDone` ref.

There is a second gap behind the first. Even with a client effect keyed on `editor.line`, asking for the same line twice (open at `:8`, move the caret away, open at `:8` again) changes nothing on the wire, so the client could not tell the second request happened. The view needs something that changes on every request.

## Correct behavior

Every open request that names a line for a file already open in an editor tab moves that tab's cursor to the start of the line (clamped to the buffer, exactly like a fresh open), drops any selection, and brings the line into view centred, the same as a fresh open with a line. This holds when the line is the same one asked for last time. An open request without a line leaves the cursor alone.

## Reproduction

Test-first in `web/src/editor/EditorTab.test.tsx`: render an `EditorTab` over a ten-line buffer (`row 1` … `row 10`) opened with `line: 5`, wait for the current row's gutter to read `5`, click the first row so the caret moves to line 1, then re-render with the same view at `line: 8`, which is what the server's duplicate-open broadcast delivers. Observed on `master`: `AssertionError: expected '1' to be '8'`. The caret stays on line 1 and the gutter still reads 1.

## Approach

Give `EditorView` an optional counter, `lineRequest`, that the duplicate-open branch bumps each time a request names a line, next to the existing `line` assignment. Every other place that rebuilds `tab.editor` spreads the old view, so the counter survives renames, saves, syncs and watcher updates.

On the client, a new hook `useEditorLineJump` remembers the counter value the tab mounted with (the initial load already honours that request's line). When the counter changes and the buffer is loaded, it moves the cursor to `line - 1` through the model's `setSelection`, which clamps and collapses the selection set, then scrolls the caret into view centred once the new position has rendered. If a request lands while the first load is still in flight, the hook waits for the buffer and applies it then.

## Implementation steps

1. `src/tab/types.ts`: add `lineRequest?: number` to `EditorView` with a comment saying what bumps it and why.
2. `src/tab/openers.ts`: in the duplicate branch, when `view.line` is defined, also set `existing.editor.lineRequest = (existing.editor.lineRequest ?? 0) + 1`.
3. `web/src/editor/useEditorLineJump.ts`: the hook described above.
4. `web/src/editor/EditorTab.tsx`: call the hook with the editor view, the editor api, and the caret ref.
5. Tests: see below.
6. Spec: tighten the sentence in `product/specs/editor-tab.md` so it says the cursor moves to the start of the line and the line comes into view, including when the same line is asked for again.

## Regression test

- `web/src/editor/EditorTab.test.tsx`: `moves the cursor of an already-loaded tab when the file is opened again with a line` (the reproduction above, with the counter bumped as the server now does) and `moves the cursor again when the same line is requested a second time`.
- `src/tab/manager.test.ts`: extend `openEditorTab updates the existing tab's line when a new line is requested` to assert the counter goes up on each request with a line and stays put on a request without one.

## Out of scope

- The bug report's suggestion that the server stop mutating `line` once the client acknowledges it. The counter makes each request distinct without an acknowledgement round trip, and `line` stays correct for a client that mounts the tab later (a reload), which loads at the last requested line.
- Any change to how a fresh open places the cursor or scrolls.
