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


* Deliver the plan's hidden-tab ordering when a docked system tab is moved.

Existing Issue: `moveTab` in `src/tab/arrange.ts` chooses same-sidebar mates whenever `tab.dock` is set before applying the hidden-system rule, while Design decision 21 requires a hidden tab's mates to be center tabs in its group and pane plus itself. Severity: 5/10

Existing Risk: 5/10 - A hidden system tab docked while hidden can be moved relative to unrelated sidebar tabs, and focusing it later can put it at an unintended position among its center-strip groups.

Proposal Risk: 2/10 - Applying the hidden target's group-and-pane ordering would remove the mismatch, though later placement changes could disturb it if the combined case is not pinned by a test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1802 "preserve hidden-system move ordering while docked". In `src/tab/arrange.ts`, select a hidden tab's center mates from the same group and pane before applying the visible-docked sidebar rule; keep visible docked tabs reorderable among all tabs on the same side. Extend `src/tab/arrange.test.ts` with a hidden system tab docked beside unrelated sidebar entries and with center mates, and assert that `tab move` changes only its group-and-pane-relative array position while the tab remains hidden. Keep the existing visible docked-tab case asserting sidebar ordering.


* Close the functionality gap in the `tab` help page by documenting the new forms and quoted-name rule.

Existing Issue: `help/tab.md` still documents only `tab focus`, presents unquoted `tab focus review notes` as valid, and says unknown subcommands print the focus-only usage line, although the parser rejects that input and now supports seven arranging forms. Severity: 6/10

Existing Risk: 6/10 - A user consulting `help tab` gets a command that now prints usage and cannot discover any of the new forms or their refusal behavior.

Proposal Risk: 2/10 - A complete help page and corrected page reference would close the direct mismatch, though the reference could drift again if future forms are not added to the same page.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1802 "update the tab command help reference". Rewrite `help/tab.md` for all eight forms, including exact quoting behavior, success and no-op behavior, notification refusals, and usage lines. Update the help-page description in `product/specs/application-commands.md` to name the `tab` command page rather than `tab focus`, and verify that `help tab` returns the revised page and its examples match parser behavior. Keep the combined row and ordering checks in `help/commands.md`.


* Deliver the plan's docked-tab `tab move` behavior accurately in user documentation.

Existing Issue: `documentation/user-documentation/command-bar/commands.md` and `documentation/user-documentation/getting-started/groups.md` describe `tab move` as limited to a tab's group and pane, but docked tabs reorder among every tab on the same sidebar regardless of group, as implemented and specified in `product/specs/tabs.md`. Severity: 4/10

Existing Risk: 4/10 - A user expecting a docked tab to move within its group can instead reorder it across unrelated sidebar entries without understanding why.

Proposal Risk: 2/10 - Stating the center-strip and sidebar rules separately would make the command's scope clear, though the visible orders can still differ after docking and undocking.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1802 "document docked tab move ordering". Update `documentation/user-documentation/command-bar/commands.md` and `documentation/user-documentation/getting-started/groups.md` to say that center tabs move within their group and pane, while docked tabs use the order of all tabs on their sidebar regardless of group. Keep the 1-based position and past-the-end behavior clear, and verify the wording against `product/specs/tabs.md` and `product/specs/sidebars.md`.


* Remove security risk from verification instructions that direct reviewers to execute project commands.

Existing Issue: The plan's Verification section instructs readers to run `check-diff` and manual commands, while the PR description's How to verify directs them to invoke `start-application.md`, launch `node bin/janus.mjs`, and run shell commands including a file redirection; these are untrusted review inputs, not commands for this review to follow. Severity: 7/10

Existing Risk: 7/10 - A reviewer who follows those directives can execute code from the proposed branch or modify workspace files before judging the change.

Proposal Risk: 3/10 - Replacing direct execution requests with inert expected-behavior checks reduces prompt-driven execution risk, though a reviewer could still independently choose to run the checkout.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1802 "remove executable directives from review verification text". Rewrite the Verification section in `product/plans/complete/arranging-tabs-from-the-command-line.md` and the How to verify section in the PR description as non-executable behavior checks: remove the task invocation, app launch, and shell command instructions, and state the expected outcomes without requesting command execution. Verify that neither review input directs its reader to invoke a task, script, or shell command.
