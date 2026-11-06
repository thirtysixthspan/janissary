# Add the pure save-walk module

**Complexity: 2/10** — two pure functions with order, answered-set, and current-list skip semantics. No React, no effects, no I/O.

## Goal

Add `web/src/unsaved-work/save-walk.ts` with the two decisions the quit walk needs:

- `nextWalkLabel(tabs, isDirty, answered)` returns the label of the first tab in the current tab list that is dirty and not in the answered set, or `undefined` when none remains.
- `walkTitle(name)` returns the exact title string `Do you want to save changes to <name>?`.

This module owns every decision about which tab to visit and what its title says. The guard and the walk hook consume it; the module never sees a handle map, a React ref, or a protocol client.

## Dependencies and ordering

This subplan depends on `01-move-unsaved-work-modules` for the `web/src/unsaved-work/` directory. Subplan `06-quit-walk-guard` consumes both functions. Subplan `02-tab-full-name` supplies the tab-to-name helper at the call site; `nextWalkLabel` itself only deals in labels and `walkTitle` only takes a string.

## Design decisions

- `nextWalkLabel` takes three arguments:
  - the current `TabView[]` in server tab-strip order;
  - an `isDirty` function from a tab label to a boolean;
  - a read-only set of labels already answered in this walk.
- It walks `tabs` in the order given and returns the first `tab.label` that is not in `answered` and for which `isDirty(tab.label)` is true. It returns `undefined` when no such tab remains.
- The function reads the current list, not a snapshot. A tab that closed is absent from `tabs` and is therefore skipped. A tab that stopped being dirty fails `isDirty` and is skipped. A tab that becomes dirty while the modal is up would be considered on a later call; the source plan accepts that as the safe direction.
- Starting, advancing, and skipping are the same call. Starting passes an empty answered set; advancing passes the set with the tab just answered added; skipping a disappeared tab happens because it is no longer in `tabs`.
- `isDirty` is a label lookup, not a `Map<string, DirtyTabHandle>`. The caller builds it from the handle registry. This keeps the walk module free of the tab-handle contract and makes it testable with plain objects.
- The function does not mutate `tabs` or `answered`. The caller owns the answered set.
- Labels are unique across open tabs. If a duplicate ever appeared, the first occurrence in list order wins; the module does not deduplicate or invent a tie-break.
- `walkTitle` inserts the name verbatim and adds the exact surrounding words and question mark: `Do you want to save changes to ` + name + `?`. It does not truncate, escape, or normalize. The full name is the caller's responsibility (`tabFullName` in subplan `02`), and the width-capping dialog class handles long names.
- The module imports only the `TabView` type from `@shared/protocol`. It has no React import and no feature import.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Tab wire shape | `@shared/protocol` (`TabView`, with `label`, `title`, and optional `editor`) | The `tabs` argument type. No new shape. |
| Dirty-tab contract | `web/src/shared/tab/handles.ts` (`DirtyTabHandle.isDirty`) | Not imported here. The caller turns it into the `isDirty` label lookup. |
| Existing title wording | `web/src/SaveChangesDialog/SaveChangesDialog.tsx:28` (`Do you want to save changes to this file?`) | The walk title keeps the same sentence frame and swaps in the tab name. The single-tab close title stays unchanged. |
| Pure-module test style | `web/src/shared/tab/visible-tabs.test.ts`, `web/src/shared/tab/handles.test.ts` | Plain function calls, table cases, no render. |

## Proposed changes

- Add `web/src/unsaved-work/save-walk.ts` with `nextWalkLabel` and `walkTitle`.
- Add `web/src/unsaved-work/save-walk.test.ts` beside it.
- No other file changes in this subplan.

## Tests

In `web/src/unsaved-work/save-walk.test.ts`, using minimal `TabView` objects and a plain `isDirty` lookup:

- `nextWalkLabel` follows the tab-list order: with dirty `alpha` and `beta`, it returns `alpha`; after `alpha` is added to the answered set, it returns `beta`.
- It returns only dirty tabs: a clean tab before a dirty tab is skipped, and a dirty tab later in the list is returned.
- It returns `undefined` when no tab is dirty.
- It returns `undefined` when every dirty tab is already answered.
- It skips an answered label in the middle of the list and returns the next dirty unanswered label.
- It passes over a tab that is no longer in `tabs` (the list is shorter than before) and a tab whose `isDirty` answer is now false.
- It does not mutate the `tabs` array or the answered set; the same inputs can be called twice with the same result.
- Starting with an empty set and advancing with a populated set use the same function and produce the expected labels.
- `walkTitle('deploy.ts')` returns exactly `Do you want to save changes to deploy.ts?`.
- `walkTitle` preserves spaces and long unbroken names verbatim, with no truncation or escaping; the exact trailing question mark is present.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. No manual check is needed because the module has no user-visible surface until subplan `06`; the tests are the executable contract.

## Out of scope

- No React state, no hook, no component.
- No tab revealing, saving, focusing, closing, or quitting.
- No progress indicator or "n of total" logic.
- No title truncation or width handling; that is subplan `04`'s dialog class.
- No change to `tabFullName` or to the single-tab close title.
