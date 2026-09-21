# Double-click focus and Enter-on-caret in the sessions table

## Complexity

1/10 — a verification-and-cleanup entry; the behavior is already on the branch.

## Goal

Close the entry "it should require a mouse double-click on a session row to cause the related tab to be focused, not a single click. A return should cause the tab indicated by the current keyboard caret highlighted to be focused."

## Verification of what the entry asks for

- A single click only makes the clicked row current — nothing opens (`sessionClickSelection` returns `opens: false` unless the row was already current).
- A click on the already-current row — the double-click gesture — opens it, raising `focus` (or `reattach` on a detached row) for the related tab. Covered by the tests "takes two clicks on the same row to open it" and "opens a detached row by reattaching it"; the first row is already current when the list opens, per the `sessionClickSelection` contract.
- Return (Enter) opens the row the keyboard caret marks: `SessionList.onKeyDown` raises the same open on Enter for `payload.entries[selected]`, with the caret moved by the arrow keys. Covered by "moves the current row with the arrow keys and opens it with Enter".

## Tests

Existing: `web/src/plugins/sessions/SessionList.test.tsx` (three cases above) and `sessions-keys.test.ts` for the pure selection rules. No new tests: no new behavior.

## Implementation steps

1. Remove the resolved entry whole from `product/backlog/pull-request.md`.
2. Promote this plan to `product/plans/complete/`.
3. Commit and push to the PR head branch.

## Out of scope

- The remaining backlog entries.
