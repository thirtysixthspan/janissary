# Prove the quit-walk title falls back from full name to label

**Complexity: 1/10** — a single test rewrite; no production code changes.

## Goal

The quit-walk guard test "falls back to the label when the current tab disappears before it is answered" walks a bare `alpha` tab whose full name already is its label, so its title reads `walkTitle('alpha')` before and after the tab is removed. It cannot see the switch from the tab's full name to the label fallback that subplan `06-quit-walk-guard.md` promises. Make the test observe that switch.

## Approach

`useQuitWalk` already computes the title as `walkTitle(quitTab ? tabFullName(quitTab) : request.label)`, with `quitTab` resolved from the live `tabs` each render. That is the behavior the plan describes, so `web/src/unsaved-work/useQuitWalk.ts` stays unchanged and only the test changes.

Give the walked tab a full name that differs from its label, `tab('alpha', { title: 'Readme' })`, so the before and after titles are distinct.

## Implementation steps

1. In `web/src/unsaved-work/CloseSaveGuard.quit-walk.test.tsx`, change the test "falls back to the label when the current tab disappears before it is answered":
   - Set up with `tab('alpha', { title: 'Readme' })` and a dirty handle for `alpha`.
   - After `startWalk`, assert `walkTitle('Readme')` is shown.
   - Call `h.setTabs([])`.
   - Assert `walkTitle('alpha')` is shown, `queryByText(walkTitle('Readme'))` is null, and the `alertdialog` is still mounted.
2. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- The rewritten test above is the coverage. The rest of `CloseSaveGuard.quit-walk.test.tsx`, `CloseSaveGuard.test.tsx`, and `save-walk.test.ts` must keep passing unchanged.

## Specs and docs

No user-visible behavior changes, so no spec, help page, or user documentation update is needed.

## Out of scope

- Any change to `useQuitWalk.ts` or `tabFullName`. The ordering of editor name, title, and label is already pinned by `web/src/shared/tab/tab-name.test.ts` and the existing full-name walk test.
