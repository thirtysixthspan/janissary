# Strip `##` comments from shell-bar lines before dispatch and history

**Complexity: 4/10** — reuse the server's existing pure helper on the client submit path (~12 added lines, 4 production files, 3 requirements, 4 scenarios, p=4.42).

## Goal

A shell tab's command bar sends `##` comments through verbatim. `## note ## notify x` reaches zsh as `##` and fails, the trailing comment in `notify tail ## drop-this` is posted as part of the message, and a comment-only line produces a shell error. The spec says submitted commands have their `##` comments stripped before being saved to history or executed. Apply that rule where the shell bar submits.

## Root cause

`stripComments` in `src/tab/utils.ts` already implements the rule and `recordHistory` in `src/tab/history.ts` calls it for the CLI path. But the web shell's submit path in `web/src/plugins/shell/useShellSubmit.ts` sends the raw typed text as the `dispatch` intent and passes the same raw text to `remember`, which fills the tab's own `Ctrl+R` list and the global history. `CommandManager` dispatches what it receives without stripping, so the shell runs the comment as a command.

## Correct behavior

Before a shell-bar line is routed or recorded, a terminated `## … ##` comment is removed wherever it appears, an unterminated `## …` is removed to end of line, and the result is trimmed. A line stripped to empty is discarded: no dispatch, no shell write, no history entry. Surrounding whitespace on a surviving command is trimmed and non-comment text is unchanged.

## Reproduction

Two failing tests in `web/src/plugins/shell/ShellTab.test.tsx` submit `## note ## notify stripped-test` and `## only comment ##` through the command bar. The first sends `dispatch` and `remember` with the raw string including `##`; the second dispatches a comment-only line. Both fail before the change. The existing `stripComments` unit cases in `src/tab/index.test.ts` pass and define the helper's exact semantics.

## Approach

Move the pure `stripComments` function into a small shared module under `src/` so the web can import it through the existing `@shared` alias, and point its two server importers at the new home. Then strip once at the top of the shell submit callback and use the stripped line for routing, dispatch, history, and echo. Reusing one function keeps the client and server on the same comment grammar; changing the helper would be a separate concern.

## Implementation steps

1. `src/comments.ts` — new module exporting `stripComments` with the current implementation moved unchanged.
2. `src/tab/utils.ts` — remove the function; `src/tab/history.ts` and `src/tab/index.test.ts` — import it from `../comments.js`. No behavior change on the server.
3. `web/src/plugins/shell/useShellSubmit.ts` — import `stripComments` from `@shared/comments`, strip the submitted text at the top of the callback, and use the stripped line for every route, `remember`, `dispatch`, `dispatch-command`, echo, and shell write. When the stripped line is empty, discard any receipt and return without dispatching, remembering, or writing.
4. Update `product/specs/comments.md` only if it needs to name the shell tab's command bar explicitly; the rule is already stated.

## Regression test

The two `ShellTab.test.tsx` cases from Reproduction are the regression guard. They fail with the raw `##` line before the fix and pass with it. The existing `stripComments` cases in `src/tab/index.test.ts` and the surrounding shell submit tests cover unterminated comments, quoted text, and the unrelated routes that must keep working.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` passes, including the new ShellTab cases and the existing comment tests.

Live E2E: start a scratch instance, open a shell tab, submit `## note ## notify stripped-test`, then `notify tail ## drop-this`, then `## only comment ##`, and read the replies and the `Ctrl+R` history rows. The driver records the visible text; it must show a toast for `stripped-test`, a toast reading `tail` without the trailing comment, no output for the comment-only line, and history rows holding the stripped commands. If the start task cannot build here or the browser is unavailable, record the reason and skip the live check.

## Out of scope

- Changing the comment grammar itself. Quoted `##` and mid-line text follow the existing helper exactly, and its unit tests stay authoritative.
- Stripping in every server dispatch entry point. This bug is the shell bar; lines from other plugin or queued sources are not changed.
- Changing how queued receipts are drained. A drained line is already stripped when it is first submitted; stripping again is idempotent.

Implementation note: `stripComments` lives in the existing import-free shared contract `src/plugins/shell/shared.ts` rather than the new `src/comments.ts` named in step 1, because that is the module channel client tab plugins are permitted to import through `@shared`. The helper body and grammar are unchanged; `src/tab/utils.ts` no longer exports it, and both server importers plus the web submit path import it from the shared contract. The rebase onto `master` applied cleanly and left the plan's goal and tests intact.
