# Document disabled-command gating in the in-app help pages

**Complexity: 1/10** — help text only; the gating behavior and its specs already ship.

## Goal

Make the in-app help pages describe the disabled-command gating that the Commands tab and the docs site already document, so `help keys`, `help commands`, and the affected command pages no longer claim a picker, confirmation, or shortcut runs unconditionally.

## Approach

Edit only `help/`. The behavior is already implemented and specified in `product/specs/application-commands.md`: a disabled command is refused at dispatch, its picker or theme dialog does not open, a command-bar `quit` or `close` line is consumed without opening its confirmation or save guard, and the five command-backed shortcuts are blocked. The user documentation under `documentation/user-documentation/` already states the same rules, so its wording is the model for the help pages. No code, test, or spec changes are needed; `src/commands.test.ts` already checks the command table's alphabetical order, description limits, and one-page-per-command coverage.

## Implementation steps

1. Update `help/keys.md`: the global `Ctrl+R`, `Ctrl+A`, `Ctrl+E`, `Cmd+Shift+F`, and `Cmd+T` rows, plus the shell-tab `Ctrl+R` / `hist`, `Ctrl+E` / `queue`, `Cmd+T`, and `Cmd+F` / `search transcript` rows, to say the shortcut is blocked when `hist`, `tasks`, `queue`, `search`, or `shell` is disabled in the Commands tab. Leave `Cmd+F` itself ungated on the transcript-search row.
2. Add a short note to `help/commands.md` that a disabled command is refused and its picker, confirmation, or shortcut does not open or run.
3. Add the same condition to `help/hist.md`, `help/queue.md`, `help/tasks.md`, `help/theme.md`, `help/syntax.md`, `help/search.md`, `help/close.md`, and `help/quit.md` where each says the command opens a picker or confirmation. On `help/close.md` and `help/quit.md`, keep the last-tab close path accurate: `Cmd+W`/`Ctrl+W` and the tab-strip close control still open the quit confirmation, and confirming dispatches `quit`, which the server refuses when `quit` is disabled.
4. Add `help/` to the documentation list in Proposed changes item 6 of `product/plans/complete/native-commands-10-client-integration.md`.
5. Run `$janissary/scripts/run.mjs check-diff` and keep `src/commands.test.ts` green.

## Tests

No new tests: this is a text-only correction and no behavior changes. The existing `src/commands.test.ts` help tests cover the command table's alphabetical order, the 200-character description limit, and the one-page-per-command check, and run automatically for `help/` changes.

## Spec and documentation

`product/specs/application-commands.md` already specifies disabled dispatch, the client picker and shortcut behavior, and the consumed `quit`/`close` lines; no spec change is needed. The docs site's user documentation already describes the gating and is not duplicated here. The generated Command Reference inherits these pages, so only `help/` is edited.

## Out of scope

- Changing any gating behavior, RPC, or server policy.
- Editing the generated docs-site Command Reference or the already-current user documentation.
- Adding gating text to help pages that do not describe a disabled command's picker, confirmation, or shortcut.
