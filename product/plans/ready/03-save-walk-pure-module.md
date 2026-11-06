# Add the pure save-walk module

**Complexity: 2/10** — two small pure functions in one new module plus a colocated test file. No React, effects, I/O, protocol, persistence, or UI; the only correctness burden is pinning tab-list order, the answered-set invariant, and the exact title string.

## Goal

Add `web/src/unsaved-work/save-walk.ts` with the two decisions the quit walk needs:

- `nextWalkLabel(tabs, isDirty, answered)` takes the live `readonly TabView[]` in the server's tab order, a total `(label: string) => boolean` dirty lookup, and a `ReadonlySet<string>` of labels already answered in this walk. It returns the `label` of the first tab in array order that is dirty and not answered, or `undefined` when none remains.
- `walkTitle(name)` returns the exact title string `Do you want to save changes to <name>?`.

This module owns only which tab to visit next and what its title says. The guard and the walk hook consume it; the module never sees a handle map, a React ref, a protocol client, or `tabFullName`.

## Dependencies and ordering

Subplans `01` and `02` are already landed in this checkout: `web/src/unsaved-work/` exists and `web/src/shared/tab/tab-name.ts:5` exports `tabFullName`. This subplan adds `save-walk.ts` and its test only, and does not depend on `04`–`09`; it can land on its own with `check-diff` green.

Subplan `06-quit-walk-guard` imports both functions. Subplan `02-tab-full-name` supplies the tab-to-name helper at that call site; `nextWalkLabel` deals only in labels, and `walkTitle` only takes a string.

## Design decisions

- **The first argument is the tab list, not a label array.** `nextWalkLabel` takes `readonly TabView[]` — the same live array `CloseSaveGuard` already keeps in `tabsRef` (`web/src/unsaved-work/CloseSaveGuard.tsx:19`) — rather than `readonly string[]`. The caller already holds this list, the array order is the walk order, and the module reads only `TabView.label`, so a label array would add a map at every call and invite a caller to pass an already filtered or reordered list. The array order is authoritative; do not sort by `tab.number`, group, or title. `TabView` is declared at `src/protocol/tab.ts:70`, with required `label` at `:73` and optional `title`/`editor` at `:110`/`:119`; only `label` matters here.

- **It returns a label, not an index or a `TabView`.** The return type is `string | undefined` and the string is exactly `tab.label`. Every consumer addresses tabs by label — `tabHandles.current.get(label)` and `client.send({ method: 'focusTab', params: { label } })` — and an index goes stale as soon as a tab is inserted or removed. Returning a `TabView` would tempt the caller to read fields that may have changed between calls.

- **Every tab in the array is eligible.** It does not filter by `hidden`, `dock`, `view`, `pane`, `systemShell`, group, active/secondary selection, or whether a handle is registered. In particular, do not route this through `visibleTabs` (`web/src/shared/tab/visible-tabs.ts`), `isCenterActionTab`, the sidebar selection, or a `!tab.dock` filter: the source plan walks docked tabs too (selected in their sidebar) and hidden tabs too (named by the title alone). Eligibility is exactly `isDirty(tab.label) === true` and `!answered.has(tab.label)`.

- **`isDirty` is a total label lookup.** The caller builds it from the handle registry, as `useQuitWalk` does in subplan `06`: `tabHandles.current.get(label)?.isDirty() === true`. A label with no registered handle must read `false`, matching `anyDirtyTab` (`web/src/unsaved-work/dirtyTabs.ts:12-13`); the lookup must not throw for a label that vanished. The module does not import `DirtyTabHandle` (`web/src/shared/tab/handles.ts:21`) and never sees `save` or `focus`.

- **The answered set is caller-owned and keyed by label.** It is a `ReadonlySet<string>`; the function only reads it and never adds to, clears, or copies it. Use `TabView.label`, never `title` or `tabFullName`: the handle registry is keyed by label (`web/src/App.tsx:113`), and a title can differ from the label or repeat. A tab answered **Don't Save** stays dirty by design, so the answered set — not `isDirty` — is what prevents it being asked again in the same walk. A tab saved earlier may now read clean, but its label remains answered.

- **There is no cursor and no memory.** The function always starts at the beginning of the array it is given. Starting passes an empty set and gets the first dirty tab; advancing passes the previous set plus the tab just answered. The caller must add that label before the next call, or a still-dirty tab (notably after Don't Save) is returned again. If a tab that was clean becomes dirty between calls, it is returned on a later call even when it sits before the tab just answered, because progress is the answered set alone. That is the source plan's safe direction, not a bug.

- **Skipping comes from the current inputs, not a snapshot.** A tab that closed is absent from `tabs`; a tab whose handle unregistered reads `false` through the lookup; a tab that stopped being dirty reads `false` as well. All three are skipped without being added to `answered`, and answered labels with no matching tab are harmless and ignored. The function keeps no snapshot, cache, or module-level state: it reads only the array and set passed on that call and gives the same answer for the same inputs. The caller passes the live list each time.

- **Labels are the tab identity.** The server derives labels through its uniqueness helpers — `uniquePluginLabel` (`src/tab/unique-labels.ts:12`), `uniqueEditorLabel` (`:33`), and `uniqueLabel` for other named tabs (`src/tab/utils.ts:48`) — and the handle map is keyed by label. If a duplicate label ever appeared, both tabs would answer the same `isDirty`; the first in list order is returned and the module does not deduplicate or invent a title-based tie-break.

- **`walkTitle` is a verbatim formatter.** The exact result is `Do you want to save changes to ` + name + `?`: capital `Do`, one space after `to`, the name unchanged, then `?` with no period, colon, quotes, or angle brackets. It does not trim, truncate, escape, HTML-encode, or normalize. A name with spaces, `?`, `&`, `<`, `>`, or a long unbroken token appears exactly as given. An empty name yields `Do you want to save changes to ?`; it does not fall back to the label. That fallback belongs to subplan `06` when the tab is gone, and `tabFullName` deliberately keeps an empty editor name or title empty (`web/src/shared/tab/tab-name.ts:5`, pinned by `web/src/shared/tab/tab-name.test.ts:28` and `:32`).

- **The single-tab close title is not changed.** `SaveChangesDialog` keeps `Do you want to save changes to this file?` at `web/src/unsaved-work/SaveChangesDialog.tsx:28`. Subplan `04` adds an optional `title` prop whose default is that literal; this subplan does not edit the dialog, does not call `walkTitle` from it, and `walkTitle('this file')` is not wired into the close path.

- **No React and no feature imports.** The only import is the type-only `TabView` from `@shared/protocol`, the same single import `web/src/shared/tab/tab-name.ts:1` uses. No React, no `DirtyTabHandle`, no `tabFullName`, no app-shell or sibling-feature import. The module lives in `unsaved-work` because the walk is its only consumer; it is not promoted to `shared/`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Tab wire shape | `src/protocol/tab.ts:70` (`TabView`; `label` at `:73`, optional `title` at `:110`, optional `editor` at `:119`), re-exported at `src/protocol.ts:135` | The `tabs` argument type. Only `.label` is read; no new shape. |
| Dirty-tab registry key | `web/src/App.tsx:113` (`tabHandles`, a `Map<string, DirtyTabHandle>` keyed by label) | The answered set and the caller's lookup use the same identity. |
| Dirty-tab contract | `web/src/shared/tab/handles.ts:21` (`DirtyTabHandle`) | Not imported. The caller reduces it to `isDirty(label)`. |
| Whole-app dirty check | `web/src/unsaved-work/dirtyTabs.ts:12` (`anyDirtyTab`), lookup at `:13` (`tabHandles.current.get(tab.label)?.isDirty()`) | Precedent for "a tab with no registered handle reads clean". Not reused for selection and not modified; it stays the boolean gate for the quit entry point in subplan `08`. |
| Existing title wording | `web/src/unsaved-work/SaveChangesDialog.tsx:28` (`Do you want to save changes to this file?`) | The walk title keeps the same sentence frame and swaps in the tab name. The single-tab close title stays unchanged; subplan `04` owns the optional `title` prop. |
| Tab full name | `web/src/shared/tab/tab-name.ts:5` (`tabFullName`) | Not imported here. Subplan `06` resolves the name and passes it to `walkTitle`. |
| Pure-module test style | `web/src/unsaved-work/dirtyTabs.test.ts` (same directory, plain `describe`/`it`, label-keyed fake handles) and `web/src/shared/tab/tab-name.test.ts:5` (complete `TabView` factory) | Follow the former's plain `describe`/`it` shape and the latter's complete-`TabView` factory; do not copy `dirtyTabs.test.ts`'s `as unknown as TabView` casts. |

There is no existing module that returns the first dirty tab. `anyDirtyTab` answers only a boolean, `CloseSaveGuard`'s `guardRef` checks one index at a time, and `visibleTabs` is about on-screen tabs rather than dirty ones. Add `save-walk.ts`; do not fold selection into `dirtyTabs.ts`, change `anyDirtyTab`, or generalize the close guard's index check into the walk.

## Proposed changes

- Add `web/src/unsaved-work/save-walk.ts` with `nextWalkLabel` and `walkTitle`, per the contracts above.
- Add `web/src/unsaved-work/save-walk.test.ts` beside it.
- Do not edit `dirtyTabs.ts`, `SaveChangesDialog.tsx`, `CloseSaveGuard.tsx`, `useSaveConfirm.ts`, `tab-name.ts`, or any sibling plan file.
- Both files stay well under the 200-line limit; no extraction is needed.
- No ESLint, TypeScript, Vitest, or Vite config change is needed: `unsaved-work` is already a feature zone (`eslint.client-feature-zones.mjs:10`) and the client test glob already covers the new test (`vitest.config.ts:78`).

## Tests

In `web/src/unsaved-work/save-walk.test.ts`, which the client project includes through `web/src/**/*.test.{ts,tsx}` (`vitest.config.ts:78`), import `nextWalkLabel` and `walkTitle` from `./save-walk` with no `.js` extension (web imports are extensionless; the NodeNext `.js` rule applies to `src/`, not `web/src/`). Build complete `TabView` values with a local `tab(label, overrides?)` factory modeled on `web/src/shared/tab/tab-name.test.ts:5`; do not cast partial objects with `as unknown as TabView`. Use a plain `Set<string>` of dirty labels as the lookup — `(label) => dirty.has(label)` — and a `Set<string>` for answered. Use one `it` per case and assert exact strings with `toBe`.

- `nextWalkLabel` follows the tab-list order: with dirty `alpha` and `beta`, it returns `alpha`; after `alpha` is added to the answered set, it returns `beta`.
- It returns only dirty tabs: a clean tab before a dirty tab is skipped, and a dirty tab later in the list is returned.
- It returns `undefined` when no tab is dirty, and when the tab list is empty.
- It returns `undefined` when every dirty tab is already answered.
- It skips an answered label in the middle of the list and returns the next dirty unanswered label.
- It passes over a tab that is no longer in `tabs` (the list is shorter than before) and a tab whose `isDirty` answer is now false.
- A tab that was clean and becomes dirty while unanswered is returned on a later call, including when it sits earlier in the list than the tab just answered. This pins that progress is the answered set, not a cursor.
- A dirty tab with `hidden: true`, a dirty tab with `dock: 'left'` or `'right'`, and a dirty tab with `view: 'plugin'` are all returned. A clean central tab before them is skipped. This pins that the function does not filter to visible center tabs.
- The answered set is keyed by label, not title: a tab with `label: 'editor-1'` and `title: 'deploy.ts'` is still returned when `answered` contains `deploy.ts`, and is skipped when it contains `editor-1`.
- It does not mutate the `tabs` array or the answered set: the labels stay in the same order, the answered set keeps exactly its original members, and calling twice with the same inputs gives the same result.
- Starting with an empty set and advancing with a populated set use the same function and produce the expected labels.
- `walkTitle('deploy.ts')` returns exactly `Do you want to save changes to deploy.ts?`.
- `walkTitle` preserves spaces, `?`, `&`, `<`, `>`, and long unbroken names verbatim, with no truncation or escaping; the exact trailing question mark is present.
- `walkTitle('')` returns exactly `Do you want to save changes to ?` — the empty name is not replaced by a label or other fallback.

No dialog test changes belong to this subplan. `SaveChangesDialog.test.tsx`, `CloseSaveGuard.test.tsx`, and `CloseSaveGuard.named-close.test.tsx` already pin the close title and must pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Because both new files are under `web/src/`, it lints them, typechecks the web project incrementally, and runs the client tests selected by the change, including `save-walk.test.ts`. While iterating, `npm run test:diff:web` runs the changed client tests alone.

No manual app check is possible in this subplan: the module has no user-visible surface until subplans `06`–`08` assemble and wire the walk. The tests are the executable contract. The first end-to-end check arrives with the wired walk: open two dirty editor tabs, type `quit`, and confirm the dialog titles name those tabs in strip order.

## Out of scope

- No React state, no hook, no component.
- No tab revealing, saving, focusing, closing, or quitting.
- No progress indicator or "n of total" logic.
- No title truncation or width handling; that is subplan `04`'s dialog class.
- No change to `tabFullName` or to the single-tab close title.
- No filtering of hidden or docked tabs; every tab in the server list is walked.
- No change to `anyDirtyTab`, `dirtyTabs.ts`, or the `DirtyTabHandle` contract.
- No change to `SaveChangesDialog`'s default title or its props; subplan `04` owns those.
