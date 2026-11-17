# bugs

## ready

* Suppress consecutive duplicate commands in a shell tab's own history picker

Existing Bug: Running the same command twice in a row in a shell tab lists it twice in that tab's Ctrl+R history picker. Severity: 2/10

Existing Risk: 2/10 - A repeated command takes two rows in the picker and reads as two distinct invocations, but nothing is lost and the command itself still works.

Proposal Risk: 2/10 - Deduping the shell's client-side history could hide a deliberate repeat a user expects to recall; a test with both immediate repeats and repeats separated by another command keeps the change to consecutive duplicates only.

Proposal: The spec states in `product/specs/history.md` that "If a command matches the last entry in the tab's history, it is not appended again." Reproduce on a freshly built app started against scratch state: from the launch shell type `notify dupcmd`, press Enter, type the same line again and press Enter, then type `notify othercmd` and press Enter; press Ctrl+R and read the rows. Expected: `notify dupcmd` once, then `notify othercmd`. Observed: `notify dupcmd`, `notify dupcmd`, `notify othercmd`. A captured trace confirms the server's tab state is not the source of the extra row: `cmdHistory` arrives empty in the state frames, because the shell tab's Ctrl+R is claimed by the shell plugin and opens `ShellHistoryPopup` (`web/src/plugins/shell/ShellHistoryPopup.tsx`) over the client-side `sent` list, not the generic picker fed by `getRecentHistory` in `web/src/pickers/recent-history.ts` (which does dedupe globally). `ShellTab.tsx` adds command-bar lines through `appendShellHistory` in `web/src/plugins/shell/shell-history.ts`, and `useTerminalCommandHistory.ts` uses the same helper for terminal commands; that helper currently only trims the line and appends it, so it never compares against the previous entry. The server-side equivalent, `recordHistory` in `src/tab/history.ts`, already skips a repeat with `tab.cmdHistory.at(-1) !== trimmed`. Make `appendShellHistory` return `previous` unchanged when `entry === previous.at(-1)`, preserving its existing empty-line handling, so the shell's own history follows the same rule as the tab history. `web/src/plugins/shell/shell-history.test.ts` already covers trimming and empty lines; extend it with an immediate-repeat case and add a shell-tab check that two submissions of one line produce a single picker row, plus a separated-repeat case that keeps both rows.

* Strip `##` command comments before a shell-bar line is recorded or run

Existing Bug: A shell tab's command bar sends `##` comments through verbatim, so `## note ## notify x` produces `zsh: command not found: ##` instead of running `notify x`. Severity: 5/10

Existing Risk: 4/10 - A documented way to prefix or trail a command with a note fails on the main command surface, leaving a confusing shell error and raw comment text in the tab's history.

Proposal Risk: 3/10 - Stripping in a shared dispatch path could alter lines where `##` is legitimately shell text, such as inside quotes or an expansion; tests should cover quoted and mid-line cases before changing the rule.

Proposal: The spec says in `product/specs/comments.md` that "Before a submitted command is saved to history or executed, `##`-delimited comments are stripped from it by `stripComments`", with a terminated comment removed wherever it appears and an unterminated one removed from `##` to end of line, and that a line stripped to empty is discarded. Reproduce on a built app started against scratch state: in the launch shell type `## note ## notify stripped-test` and press Enter, then `notify tail ## drop-this`, then `## only comment ##`. Expected: a toast for `stripped-test`, a toast for `tail` with the trailing comment gone, and no output for the comment-only line; history should hold the stripped commands. Observed: the terminal shows `zsh: command not found: ##` for the first and third lines, the second toast reads `tail ## drop-this`, and the shell history picker lists all three raw lines including the `##` text. The helper itself is correct: `stripComments` in `src/tab/utils.ts` has direct unit coverage in `src/tab/index.test.ts`, and `recordHistory` in `src/tab/history.ts` calls it for the CLI path. The web shell's submit path in `web/src/plugins/shell/useShellSubmit.ts` sends the unmodified line as the `dispatch` RPC, and `CommandManager` in `src/command/manager.ts` records and dispatches it without ever calling `stripComments`, so the shell receives `##` as a command. Apply the strip in the shared command-manager entry points before history recording and dispatch, or at minimum in the shell submit path, keeping the existing whitespace-collapse and empty-input behavior. A regression check should drive a shell tab with a prefixed comment, a trailing unterminated comment, and a comment-only line, and assert both the visible command result and the stripped history rows.

## development

## deferred

## declined
