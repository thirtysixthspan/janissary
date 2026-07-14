# Fix regression: transcript text is not selectable

**Complexity: 4/10** — root cause is a focus-stealing `onMouseDown` handler fighting with native
drag-to-select; fix reconciles two previously-shipped, spec'd behaviors (click-anywhere focuses
the command bar; drag-selecting transcript text copies to the clipboard) rather than adding new
architecture.

## Goal

Selecting transcript text by clicking and dragging should work again. It stopped working because
clicking anywhere in the agent tab body immediately refocuses the command-line textarea, which
collapses any selection the user is in the middle of making.

## Background (verified)

- `web/src/App.tsx` (the `.tab-body` div wrapping `Transcript`) had:
  ```tsx
  onMouseDown={() => setTimeout(() => inputReference.current?.focus(), 0)}
  onMouseUp={() => {
    const selection = globalThis.getSelection()?.toString();
    if (selection) navigator.clipboard.writeText(selection);
  }}
  ```
  The `onMouseDown` handler refocuses the command input on **every** mousedown anywhere in the
  tab body — not just prompt lines, all transcript content. It's deferred one macrotask via
  `setTimeout(..., 0)`, but that still runs the focus call well before a user's click-and-drag
  gesture can complete. Moving focus to a different element collapses any in-progress
  `window.getSelection()` range in most browsers, so the moment mousedown fires, a nascent
  selection anchor is wiped — text selection by drag was effectively impossible.
- History: this `onMouseDown` focus call was originally synchronous
  (`onMouseDown={() => inputReference.current?.focus()}`), implementing
  `specs/tabs.md:67-69` ("pressing anywhere in the body of an agent tab immediately moves keyboard
  input focus to that tab's command bar... This happens on mouse-down (before the click is
  released)..."). `plans/complete/agent-tab-body-click-focus.md` later wrapped it in
  `setTimeout(0)` to fix a *different* bug (modern browsers' scrollable `overflow-y: auto`
  Transcript container natively grabbing focus on click, racing the synchronous `.focus()` call).
  That plan's own "Out of scope" explicitly says "No changes to text selection behavior in the
  transcript" — the fix wasn't intended to affect selection, but refocus-on-every-mousedown is
  inherently in tension with drag-to-select regardless of timing.
- The existing `onMouseUp` handler already had the right idea (copy selected text to clipboard,
  per `specs/history.md:15`: "Drag-selecting text on a prompt line still copies to the clipboard
  and does not trigger execution") but didn't prevent the earlier `onMouseDown` from already
  having destroyed the selection by the time `mouseup` fired.
- `specs/history.md:13-15` ("Click to execute") is also stale independent of this bug: it still
  says a single click on a prompt line executes it, but the click-to-run gesture was already
  changed to a **double**-click in a previous fix (`plans/complete/transcript-prompt-double-click.md`,
  documented correctly in `specs/transcript.md`'s "Re-running a prompt line" section). Since this
  fix touches exactly this area (click/selection/focus interplay in the transcript), the stale
  line is corrected too rather than left contradicting `specs/transcript.md`.
- `web/src/App.test.tsx`'s `'mousedown on the agent tab body focuses the command input textarea'`
  test only asserted the focus-after-mousedown behavior in isolation — it never simulated a
  concurrent selection, so it couldn't have caught this regression.

## Approach

Move the focus call from `mousedown` to `mouseup`, merged into the existing selection-check
handler: if the mouseup ends with a non-empty selection, keep the existing copy-to-clipboard
behavior and skip focusing; otherwise (a plain click, no drag), focus the command input. Since
`mouseup` always fires after all of a click's default browser focus-assignment behavior has
already happened (including the scrollable-container-steals-focus quirk `setTimeout(0)` was
originally added for), this also removes the need for the `setTimeout` deferral entirely.

## Implementation

1. **`web/src/App.tsx`** — replace the separate `onMouseDown`/`onMouseUp` handlers on `.tab-body`
   with a single merged `onMouseUp`:
   ```tsx
   onMouseUp={() => {
     const selection = globalThis.getSelection()?.toString();
     if (selection) { navigator.clipboard.writeText(selection); return; }
     inputReference.current?.focus();
   }}
   ```
2. **`specs/tabs.md`** — update the "Keyboard focus on tab press" section: focus now moves on
   mouse-**up** rather than mouse-down, and is skipped when the mouse gesture produced a text
   selection (drag-selecting transcript text), so selection is preserved.
3. **`specs/history.md`** — correct the stale "Click to execute" section: the click-to-run gesture
   is a **double**-click (matching `specs/transcript.md`), and drag-selecting text is unaffected
   by the tab-body's focus-on-click behavior.

## Tests

`web/src/App.test.tsx`, `describe('App agent tab body click focuses command input', ...)`:

1. Renamed existing test — `'mouseup on the agent tab body focuses the command input textarea
   when nothing is selected'`: fires `mouseUp` (no `mouseDown`/`setTimeout` needed now, since the
   handler runs synchronously) and asserts the textarea is focused.
2. New test — `'does not steal focus on mouseup when the transcript has a text selection'`: mocks
   `getSelection()` to return non-empty text (via `vi.spyOn`, following
   `transcript-line.test.tsx`'s existing convention) and `navigator.clipboard` (via
   `vi.stubGlobal`, following `useEditor.test.ts`'s existing convention), fires `mouseUp`, and
   asserts the input does **not** become the active element.
3. New test — `'copies selected text to the clipboard on mouseup instead of focusing the input'`:
   same selection mock, asserts `navigator.clipboard.writeText` was called with the selected text.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual: run the app, click-and-drag to select some
transcript output text, confirm the selection survives (doesn't collapse) and a plain click
elsewhere in the tab body still focuses the command input. Not runnable in this environment —
note as unverified manually if so; the researching agent flagged that jsdom's `Selection` API and
real-browser drag behavior diverge, so this is the one part of the fix most worth a human's
manual click-and-drag check in an actual browser.

## Out of scope

- Any further changes to the double-click-to-run-a-command behavior itself (already correct,
  `specs/transcript.md`).
- The clipboard-copy-on-selection mechanism's existence — kept as-is, just no longer undermined
  by the mousedown focus-steal.
