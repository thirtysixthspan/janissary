# Shell tab shared textarea splice

**Complexity: 2/10** — the shell plugin carries a line-for-line copy of a shared helper; publishing the helper through the plugin API and deleting the copy is a three-file change with no behavior change.

## Goal

Make the shell tab insert picked tasks at its caret with the same `spliceIntoTextarea` helper the agent command bar uses, so a later fix to caret insertion (undo behavior, caret placement) reaches both bars at once.

## Approach

`web/src/plugins/shell/insert-command-at-caret.ts` duplicates `spliceIntoTextarea` in `web/src/shared/command-bar/textarea-splice.ts`. A concrete client plugin may not import host modules directly, so the shared helper reaches the shell plugin through the published client surface, `web/src/plugins/api.ts`, beside the command-bar components already published there. The addition is additive, so `TAB_PLUGIN_API_VERSION` does not move.

## Implementation steps

1. Export `spliceIntoTextarea` from `web/src/plugins/api.ts`, re-exported from `web/src/shared/command-bar/textarea-splice.ts` next to the published command-bar shell and keymap.
2. In `web/src/plugins/shell/ShellTab.tsx`, import `spliceIntoTextarea` from `../api` and use it for the task-insertion handler in place of `insertCommandAtCaret`.
3. Delete `web/src/plugins/shell/insert-command-at-caret.ts`.
4. In `product/specs/tab-plugins.md`, note under "Borrowing the application's command bar" that the bar's caret insertion is offered beside the bar and its keys.

## Tests

- `web/src/plugins/api.test.ts`: the published `spliceIntoTextarea` is the shared helper itself, in the same shape as the existing `nextListSelection` surface assertion.
- Existing `ShellTab.test.tsx` task-insertion and clipboard cases, and `web/src/shared/command-bar/textarea-splice.test.ts`, keep passing unchanged.

## Out of scope

- Changing caret insertion behavior in either bar.
- User documentation and `help.md` changes: no user-visible behavior changes.
