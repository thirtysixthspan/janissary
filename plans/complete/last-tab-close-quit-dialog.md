# Closing the last open tab triggers the quit dialog

**Complexity: 4/10** — the quit-dialog machinery (`useQuitConfirm`, `useUnsavedQuitGuard`) and the
"is this the last tab" predicate already exist and are used correctly by the typed `close`/`exit`/
`quit` command-bar path; the regression is that the tab-strip's × button, Cmd+W, and a page-view
tab's own close button all call `closeTab` directly with no equivalent check. A conditional in one
function plus threading one existing callback down one more level.

## Goal

Closing the last remaining tab always shows the quit-confirmation dialog (or the unsaved-changes
variant, if an editor tab is dirty) — regardless of which UI affordance is used: the tab-strip's ×
button, Cmd+W, the page-view tab's own × button, or the typed `close`/`exit` command (already
correct). Cancelling leaves the tab open; confirming quits.

## Design decisions

**Reuse `guardedOpenQuitConfirm`, don't build a second dialog path.** `useUnsavedQuitGuard`'s
`guardedOpenQuitConfirm` (wrapping `useQuitConfirm`'s `openQuitConfirm`) is already the single
place that decides "show the unsaved-changes dialog or the plain quit dialog" for `quit` and for
the command-bar's last-tab `close`/`exit`. The regression is only that `App.tsx`'s own `closeTab`
— the function the tab-strip, Cmd+W, and (once wired) `PageTab`'s close button all call — never
consults it.

**The last-tab check goes first, ahead of the per-tab `guardRef` (`CloseSaveGuard`).** `guardRef`
is `CloseSaveGuard`'s per-*tab* dirty check, meant for closing one of several tabs. When only one
tab remains, `guardedOpenQuitConfirm` already re-checks every tab's dirty state
(`anyDirtyEditor`), so running `guardRef` first would risk a redundant or conflicting prompt.
Mirrors the existing predicate in `useCommandBarSubmit.ts:46`
(`tabs.filter((t) => !t.dock).length === 1`) — docked tabs (sidebar file trees) don't count, matching
that they're excluded from `actionEntries` and can never be "the last tab" in the everyday sense.

**Fix `PageTab`'s close button too — same bug, same fix.** `PageTab.tsx`'s own × button (embedded
web-page tabs render their close control inside the tab body, not just the tab strip) calls
`client.send({ method: 'closeTab', ... })` directly, bypassing `App.tsx`'s `closeTab` entirely —
so it has the identical last-tab gap. `FileTreeTab.tsx` and `Sidebar.tsx` have similar direct
`client.send('closeTab')` calls, but both are gated to *docked* tabs only (`{dock && (...)}` /
Sidebar only ever renders docked entries), which are excluded from the "last tab" count by
definition — so those are not part of this bug and are left untouched.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| "Is this the last (non-docked) tab" predicate | `web/src/useCommandBarSubmit.ts:46` |
| `guardedOpenQuitConfirm` (unsaved-aware quit gate) | `web/src/useUnsavedQuitGuard.ts:32-35` |
| `App.tsx`'s `closeTab`, called by `TabStrip`'s × and `useCmdW` (Cmd+W) | `web/src/App.tsx:122-124`, `web/src/useCmdW.ts` |
| Per-tab dirty guard for the *non-last-tab* case (unchanged) | `web/src/CloseSaveGuard.tsx` (via `guardRef`) |

## Web changes

1. **`web/src/App.tsx`** — `closeTab` checks `tabs.filter((t) => !t.dock).length === 1` first; if
   true, calls `guardedOpenQuitConfirm()` and returns instead of consulting `guardRef` or sending
   `closeTab` to the server. Also pass `closeTab` as a new prop into `<ViewTabBody />`.
2. **`web/src/ViewTabBody.tsx`** — add a `closeTab: (index: number) => void` prop; pass it through
   to `<PageTab />` in place of `client`.
3. **`web/src/PageTab.tsx`** — replace the `client: JanusClient` prop with `closeTab: (index: number) => void`;
   the × button calls `closeTab(index)` instead of `client.send({ method: 'closeTab', ... })`.
   `client` becomes unused here and is dropped from the props entirely.

## Tests

- **`web/src/App.test.tsx`** (new case) — with a single tab in state, clicking the tab-strip's
  `.tab-close` button opens the quit dialog (`"Are you sure you want to quit?"` visible) and does
  **not** send a `closeTab` RPC; with two tabs, clicking `.tab-close` still sends `closeTab`
  directly (no dialog) — guards against regressing the normal multi-tab case.
- **`web/src/PageTab.test.tsx`** — update the existing "clicking the close button" case to pass a
  `closeTab` mock instead of a `client` mock; assert `closeTab` is called with the tab's index.
- **`web/src/ViewTabBody.test.tsx`** — add a `closeTab: vi.fn()` prop to every render call (required
  prop); extend the existing "renders PageTab" case to click the page tab's close button and assert
  the passed `closeTab` mock is called with the tab's index.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related web tests.
- Manual (not run in this environment): open the app with a single tab, click the tab's × in the
  tab strip — confirm the quit dialog appears instead of the app silently exiting. Repeat with
  Cmd+W. Open a page-view tab (`browser <url>`) as the only tab and click its own × — same result.

## Out of scope

- `FileTreeTab.tsx`'s and `Sidebar.tsx`'s docked-tab close buttons — docked tabs are excluded from
  the last-tab count and were never part of this regression.
- Any change to `CloseSaveGuard`/`guardRef`'s per-tab behavior for the *non-last* tab case.
