# bugs

## ready

* Strip `##` command comments before a shell-bar line is recorded or run

Existing Bug: A shell tab's command bar sends `##` comments through verbatim, so `## note ## notify x` produces `zsh: command not found: ##` instead of running `notify x`. Severity: 5/10

Existing Risk: 4/10 - A documented way to prefix or trail a command with a note fails on the main command surface, leaving a confusing shell error and raw comment text in the tab's history.

Proposal Risk: 3/10 - Stripping in a shared dispatch path could alter lines where `##` is legitimately shell text, such as inside quotes or an expansion; tests should cover quoted and mid-line cases before changing the rule.

Proposal: The spec says in `product/specs/comments.md` that "Before a submitted command is saved to history or executed, `##`-delimited comments are stripped from it by `stripComments`", with a terminated comment removed wherever it appears and an unterminated one removed from `##` to end of line, and that a line stripped to empty is discarded. Reproduce on a built app started against scratch state: in the launch shell type `## note ## notify stripped-test` and press Enter, then `notify tail ## drop-this`, then `## only comment ##`. Expected: a toast for `stripped-test`, a toast for `tail` with the trailing comment gone, and no output for the comment-only line; history should hold the stripped commands. Observed: the terminal shows `zsh: command not found: ##` for the first and third lines, the second toast reads `tail ## drop-this`, and the shell history picker lists all three raw lines including the `##` text. The helper itself is correct: `stripComments` in `src/tab/utils.ts` has direct unit coverage in `src/tab/index.test.ts`, and `recordHistory` in `src/tab/history.ts` calls it for the CLI path. The web shell's submit path in `web/src/plugins/shell/useShellSubmit.ts` sends the unmodified line as the `dispatch` RPC, and `CommandManager` in `src/command/manager.ts` records and dispatches it without ever calling `stripComments`, so the shell receives `##` as a command. Apply the strip in the shared command-manager entry points before history recording and dispatch, or at minimum in the shell submit path, keeping the existing whitespace-collapse and empty-input behavior. A regression check should drive a shell tab with a prefixed comment, a trailing unterminated comment, and a comment-only line, and assert both the visible command result and the stripped history rows.

## development

## deferred

## declined
