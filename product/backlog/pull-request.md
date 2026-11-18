<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's native command start activity so a command is recorded when it begins, not only after it finishes.

Existing Issue: The single-entry loop callback leaves startCommand empty and records both the command text and its result only in ranCommand, so a command is never written to the attempt record feed or live activity at the moment it starts. Severity: 5/10

Existing Risk: 4/10 - A command that is aborted, errors before returning, or hangs mid-execution leaves no trace of what the subagent tried to run, and a monitor sees no in-progress tool step until the command completes, which it may never do.

Proposal Risk: 1/10 - Routing startCommand through the existing toolActivity helper mirrors the established pattern and the record feed already has colocated coverage, so the change stays local and needs no gate or transport work.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "record native command start activity at command start". In src/subagent/attempt.ts change the handlers passed to runToolLoop so startCommand calls state.toolActivity(command, workspace), and change ranCommand to call state.toolActivity only for result, leaving the chosen guard and remote host tagging inside state.toolActivity untouched. This aligns with src/agent/execute.ts, where startCommand records the command and ranCommand records the result, and it delivers the subplan step that records native start/result activity as that file does while keeping activity separate from the terminal response. Add a test in src/subagent/attempt.test.ts that starts a long-running command through the real loop and asserts the command text reaches the record feed before the command resolves, plus a case where the command is aborted or throws and its command text is still recorded; the existing tool-output and capped-result tests must keep passing unchanged.
