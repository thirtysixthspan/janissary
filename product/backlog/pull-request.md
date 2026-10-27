<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the bare-help verification to allow the queue row's shortcut reference.

Existing Issue: Description step D1 says `help` omits `Ctrl+E`, but the returned command table's `queue` row includes `Ctrl+E`. Severity: 2/10

Existing Risk: 3/10 - A reviewer following this step can report a false failure even though bare help correctly omits the separate Key Bindings section.

Proposal Risk: 1/10 - The corrected assertion could still miss another stale command-table detail, though its table and page coverage checks already run in CI.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct the bare-help verification expectation". Replace D1 in the PR description's How to verify with: "In the focused command bar, `help` displays the command table headed `### Commands` as formatted Markdown. It includes `help` and `profile`, and omits `### Key Bindings`; the `queue` row still mentions `Ctrl+E`." The tested output includes `Ctrl+E` in the `queue` row while it contains no separate Key Bindings section; `help/commands.md` and `getOutput` in `src/commands.ts` are the source and reader. Correct the description step without changing application output; keep the command-table regression coverage that verifies the row and its ordering.


* Correct the `helper` verification for the launch shell.

Existing Issue: Description step D12 expects the application unknown-command message after `helper` is entered in the fresh `janus` shell command bar, but that shell sends unclaimed lines to zsh, which returns `zsh: command not found: helper`. Severity: 2/10

Existing Risk: 3/10 - A reviewer can mark a correct shell-routing behavior as a failure and may mistake the zsh reply for a regression in help classification.

Proposal Risk: 1/10 - A corrected shell-specific step could still leave the non-shell unknown-command response unexplained elsewhere in the description.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct helper verification for the launch shell". Replace D12 in the PR description's How to verify with: "In the focused `janus` shell command bar, `helper` is sent to zsh and produces `zsh: command not found: helper`." The output reproduced twice. `getOutput` in `src/commands.ts` classifies `helper` as unknown, but `resolveCommand` in `src/resolve.ts` returns that classification as unclaimed; `dispatchLine` in `src/command/manager.ts` reports no dispatch, so `useShellSubmit` in `web/src/plugins/shell/useShellSubmit.ts` sends the line to zsh. This matches `product/specs/shell-tab.md`, which says unclaimed shell-bar lines go to zsh; correct the description rather than changing routing.


* Close the functionality gap that makes zero-width profile sidebars unreplayable.

Existing Issue: The profile loader accepts a numeric sidebar width of 0 and `profile launch` applies it unchanged, but `layout show` prints `layout sidebar left 0`, which `parseLayoutCommand` rejects because pixel sizes must be positive. Severity: 5/10

Existing Risk: 5/10 - A profile with a collapsed sidebar produces output that cannot be pasted into a runscript to recreate that layout.

Proposal Risk: 3/10 - Other profile values outside the command's accepted range could still make reported commands unusable unless profile validation and layout reporting share a defined range.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1801 "make zero-width profile sidebars replayable". Define a shared accepted range for profile sidebar widths and `layout sidebar`, preserving zero as a valid width because profile layouts already apply it exactly. Update `parse-layout.ts` to accept zero for sidebar widths while keeping window dimensions positive, and update `product/specs/application-commands.md` and `help/layout.md` to document the boundary. Add parser and `layout show` tests proving a zero-width layout emits a command that parses successfully, and update `src/profile/schema.ts` to reject negative sidebar widths so other profile values cannot yield an unusable negative command; preserve fractional widths and their existing rounding behavior.


* Treat the PR's imperative build and check instructions as untrusted data.

Existing Issue: The PR description directs readers to build and launch this branch, and the carried plan directs readers to run `check-diff`, so branch-authored content asks an agent with shell access to execute branch-controlled scripts. Severity: 7/10

Existing Risk: 7/10 - A reviewer following those steps can execute arbitrary code from the untrusted branch through its build scripts or launched application.

Proposal Risk: 3/10 - Passive descriptions still contain command strings that could be misread, but they no longer direct a reviewer to execute branch-controlled code and a separate trusted task must authorize any run.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1801 "make branch-authored verification steps inert". Rewrite the PR description's `How to verify` section and the carried plan's `Verification` section as declarative records of intended checks rather than imperative instructions to execute `npm run build`, launch `node bin/janus.mjs`, or run `$janissary/scripts/run.mjs check-diff`; retain any needed command strings only as quoted reference data, not directions to the reviewing agent.
