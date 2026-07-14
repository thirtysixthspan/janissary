# Warn on unsaved editor changes when quitting or closing the last tab

**Complexity: 4/10** — the per-tab close path was already fully guarded; this closes a narrower gap
in the whole-app close paths (`quit`, last-tab close, and the real browser/OS window close) that
bypass it.

## Goal

If any open editor tab has unsaved changes when the user runs `quit`, or closes the last remaining
tab, the app shows a dialog — "You have unsaved changes. Close anyway?" with **Close anyway** and
**Cancel** — instead of proceeding (or showing the plain quit confirmation) silently. Confirming
quits immediately, discarding the unsaved edits; cancelling leaves every tab open and intact.
Additionally, closing the actual browser tab/window (outside the app's own UI) arms a native
`beforeunload` prompt under the same condition, since no in-app dialog can intercept that path.

## Design decisions

**Per-tab close was already correct — the gap was one level up.** `CloseSaveGuard` (existing) fully
guards closing a *single* editor tab via the tab strip's × button, Cmd+W/Ctrl+W, and typed
`close`/`exit` on a non-last tab — all of these funnel through the app-level `closeTab` function
(`web/src/App.tsx`), which calls `guardRef.current?.(index)` before sending the RPC. But `quit` and
`close`/`exit` on the *last* remaining tab (`web/src/useCommandBarSubmit.ts`) go straight to
`openQuitConfirm()` and never call `closeTab` or consult `guardRef` at all — so an editor tab could
have unsaved changes and quitting would discard them with no warning.

**A new dialog, not a reuse of `SaveChangesDialog` or `QuitDialog`.** The wording needed
("You have unsaved changes. Close anyway?" / "Close anyway" / "Cancel") doesn't match either
existing dialog's copy, and this codebase's convention is one small dedicated component per
distinct prompt (`QuitDialog`, `SaveChangesDialog`, the editor's `OverwriteConflictDialog`) rather
than parameterizing one generic modal — so `UnsavedQuitDialog` follows that pattern.

**One dirty check reused by both the in-app dialog gate and the native `beforeunload` guard.** A
tiny pure helper, `anyDirtyEditor(tabs, editorHandles)`, checks whether any tab with an `editor`
view is dirty (mirroring the same `.isDirty()` check `CloseSaveGuard` already does per-tab). Both
`useUnsavedQuitGuard` (wraps `openQuitConfirm`) and its own `beforeunload` listener call this same
helper, so there's exactly one definition of "is there something to lose."

**The `beforeunload` prompt can't share copy with the in-app dialog.** Modern browsers render their
own generic message for `beforeunload`, ignoring any custom string — only `preventDefault()` /
setting `returnValue` matters to trigger the prompt at all. This is accepted as a browser
limitation, not a bug: the native prompt is a safety net for the one path no in-app UI can reach,
not a replacement for the in-app dialog's clearer wording.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Per-tab dirty check + 3-button dialog to mirror styling from | `web/src/CloseSaveGuard.tsx`, `web/src/SaveChangesDialog/SaveChangesDialog.tsx` |
| 2-button dialog structure to mirror exactly | `web/src/QuitDialog/QuitDialog.tsx` (and the editor's `web/src/OverwriteConflictDialog.tsx`) |
| `quit` / last-tab-close dispatch (where the gap is) | `web/src/useCommandBarSubmit.ts` |
| `openQuitConfirm` / `runCommand('quit')` flow to wrap | `web/src/QuitDialog/useQuitConfirm.ts` |
| `editorHandles` map + `EditorTabHandle.isDirty()` | `web/src/App.tsx`, `web/src/EditorTab.tsx` |
| Existing iframe-specific `beforeunload` fallback (separate concern, do not conflate) | `web/src/useCmdW.ts` |

## Web changes

1. **`web/src/dirtyEditors.ts` (new)** — `anyDirtyEditor(tabs, editorHandles)`: true if any tab
   with an `editor` view has a registered, dirty `EditorTabHandle`.
2. **`web/src/UnsavedQuitDialog.tsx` (new)** — 2-button modal, structurally identical to
   `QuitDialog`/`OverwriteConflictDialog` (same keyboard handling, click-outside swallowing, focus
   management), with "You have unsaved changes. Close anyway?" / "Close anyway (y)" / "Cancel (n)".
3. **`web/src/useUnsavedQuitGuard.ts` (new)** — takes `(tabs, editorHandles, openQuitConfirm,
   runCommand)` and returns `{ unsavedQuitOpen, guardedOpenQuitConfirm, confirmUnsavedQuit,
   cancelUnsavedQuit }`. `guardedOpenQuitConfirm` opens the new dialog when `anyDirtyEditor` is
   true, otherwise calls the raw `openQuitConfirm` unchanged. Also arms a `beforeunload` listener
   (same `anyDirtyEditor` check) for the real browser/OS window close.
4. **`web/src/App.tsx`** — wire `guardedOpenQuitConfirm` in as the `openQuitConfirm` passed to
   `useCommandBarSubmit` (in place of the raw one), render `UnsavedQuitDialog` alongside the
   existing `QuitDialog`, and fold `unsavedQuitOpen` into the existing `quitConfirmOpenRef` /
   `CommandArea`'s `pickerOpen` gating so Cmd+W and the command bar are inert while it's open.
5. **`web/src/useFocusOnTabSwitch.ts` (new)** — incidental extraction: `App.tsx` crossed the
   200-line limit once this feature's wiring was added; the self-contained "focus the right thing
   when the active tab changes" effect was pulled out verbatim into its own hook to get back under
   the limit, per `ai/guidelines/code-guidelines.md` (extract, don't compact).

## Tests

- **`web/src/dirtyEditors.test.ts`** — no editor tabs / all clean / any dirty / editor view present
  but no handle registered yet.
- **`web/src/UnsavedQuitDialog.test.tsx`** — mirrors `QuitDialog.test.tsx`'s full keyboard/click/
  focus coverage for the new copy.
- **`web/src/useUnsavedQuitGuard.test.ts`** — passes through to the raw `openQuitConfirm` when
  clean; opens the new dialog instead when dirty; confirm/cancel behavior; the `beforeunload`
  listener only calls `preventDefault()` when dirty.
- **`web/src/useFocusOnTabSwitch.test.ts`** — harness-PTY / shell-PTY / command-line focus branches,
  and that it only re-runs when `activeTab` changes.
- **`web/src/App.test.tsx`** — existing 15 tests re-verified unaffected by the wiring change.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related web tests.
- Manual (not run in this environment): open a file with `edit`, type into it without saving, then
  run `quit` — confirm the new "unsaved changes" dialog appears instead of the plain quit
  confirmation, and that Cancel leaves the edit intact while Close anyway exits. Close the browser
  tab directly (not via the app) with unsaved changes — confirm the browser's native prompt
  appears.

## Out of scope

- A per-file save step inside the unsaved-quit dialog (e.g. "save all, then quit"). The dialog is a
  single discard-or-cancel choice, matching the original issue's wording.
- Customizing the native `beforeunload` message — browsers do not allow it.
