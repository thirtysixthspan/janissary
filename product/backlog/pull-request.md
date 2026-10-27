<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's tab and system schedule management forms.

Existing Issue: `help/schedule.md` lists only schedule creation, omitting `schedule list`, `schedule cancel`, `schedule clear`, their `[in <tab>]` targeting forms, and the corresponding system list, cancel, and clear commands. Severity: 6/10

Existing Risk: 5/10 - Users can create timers from the page but cannot discover how to inspect, cancel, or clear them, including project-owned system schedules.

Proposal Risk: 2/10 - Listing the management forms alongside creation makes the command discoverable, with only the ongoing risk that help text can drift from the parser.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "document schedule management command forms". Extend the Usage block and examples in `help/schedule.md` with tab schedule creation forms, the optional `in <tab>` target, `schedule list/cancel/clear`, and `schedule system list/cancel/clear`, preserving the existing system schedule creation form. Use `product/specs/scheduling.md`, `src/schedule/parsing.ts`, and `src/commands/schedule.ts` as the grammar and behavior sources. Existing `src/commands/schedule.test.ts` covers tab and system creation, listing, cancellation, clearing, and tab targeting; no test pins help wording, so compare the page directly with those cases.


* Correct the plan's unsupported application argument in the open-command help.

Existing Issue: `help/open.md` advertises `open external [application] <path|url>`, but `src/commands/open.ts` consumes only the `external` and `page` modifiers and treats the remaining text as the target. Severity: 5/10

Existing Risk: 4/10 - A user following the signature supplies an application name as part of the target and gets a failed or unintended open instead of choosing a viewer.

Proposal Risk: 1/10 - Correct signatures remove the unsupported invocation, with only the usual risk of later documentation drift.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct the open help command signatures". Replace the unsupported application placeholder in `help/open.md` with the actual inline and external forms, including `open external <path>` and the `page` modifier for web addresses, and keep its examples consistent with those forms. `product/specs/open.md` describes the supported grammar; `src/commands/open.ts` and `src/commands/open.test.ts` verify that only `external` and `page` are consumed as modifiers and that both modifiers can be combined. No test pins help wording, so verify the updated signatures directly against the parser tests.


* Correct the plan's task-picker help for harness tabs.

Existing Issue: `help/tasks.md` says selecting a task always inserts its command into the command line, while a harness tab has no command line and receives the command through its terminal input. Severity: 3/10

Existing Risk: 2/10 - A user opening the picker over a harness can expect an editable command-line draft that does not exist in that tab.

Proposal Risk: 1/10 - Describing both destinations sets the right expectation, with only the risk that the wording later drifts from the picker behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "describe task picker behavior in harness tabs". Update the description in `help/tasks.md` to distinguish command-line insertion without submission in command-bar tabs from sending the task command to the harness PTY when the picker is opened over a harness tab. `web/src/pickers/useTaskPicker.ts` implements the two destinations, `web/src/pickers/useTaskPicker.test.ts` covers both, and `product/specs/task-picker.md` records the user-visible behavior; no help-text assertion exists, so verify the wording against those cases.


* Deliver the plan's repeatable skill clause in agent help.

Existing Issue: `help/agent.md` shows `[with skill <name>]` only once even though the agent launch grammar permits repeating that clause to select multiple skills. Severity: 4/10

Existing Risk: 3/10 - Users may miss the ability to combine skills in one launch and repeat work or settle for a single skill.

Proposal Risk: 1/10 - Marking the clause as repeatable and showing a multi-skill example exposes the supported form, with only the risk of later help-text drift.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "document repeatable skills in agent help". Mark the `with skill <name>` clause as repeatable in the Usage block of `help/agent.md` and add an example with two skill clauses. `product/specs/agent-command.md` describes repeated skill clauses, while `src/agent/command-parser.ts` parses them and deduplicates repeated names; `src/agent/command-parser.test.ts` covers multiple clauses and deduplication. No test pins help wording, so compare the updated signature and example directly with those cases.
