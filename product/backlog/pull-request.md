<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's single-reply behavior for tell usage and refusals.

Existing Issue: When `AcpManager.run` rejects a tell prompt before starting, it appends the command and error to the tab log, then `tell.ts` appends the same result as a background reply, so the shell receives the same text through both `bufferLines` and `backgroundReplies`. Severity: 5/10

Existing Risk: 4/10 - Users see duplicate lines for bare `tell`, a same-role refusal, a tell role with no enabled models, or a remote shell that is still connecting, making one command appear to settle twice.

Proposal Risk: 2/10 - Publishing each refusal through one shell-output path prevents duplicate lines, though later changes to prompt settlement could still append twice.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "avoid duplicate tell refusal and usage output". In `src/acp/manager.ts`, make the refusal and no-model branches return the result without also appending the command and error when the caller will publish it, while preserving the ordinary transcript result for direct ACP API callers. Keep `src/commands/tell.ts` responsible for one background reply per settlement. Add an integration test that dispatches bare `tell`, a tell prompt with no enabled model, a second prompt while tell is active, and a prompt on a still-connecting remote shell; assert each outcome appears once across the tab buffer and background replies. Preserve the existing successful prompt, cancellation, reset, and fallback coverage, and add the equivalent ask assertions if the shared manager path changes ask behavior.


* Correct the pull request title to describe the implemented role grants and tell command.

Existing Issue: The PR title calls this `docs(plan): decompose role native commands and tell`, while its current body and 120-file diff describe and implement role command grants and the `tell` command. Severity: 3/10

Existing Risk: 3/10 - Readers scanning the pull request list can mistake a completed feature implementation for a plan-only documentation change.

Proposal Risk: 1/10 - A title that names the implemented feature makes the PR's scope clear, though the code and documentation remain as submitted.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "align PR title with implemented role grants and tell feature". Update the pull request title to a Conventional Commit title that describes the shipped role-native command grants and tell command, matching the current PR body and aggregate diff. Leave the implementation and documentation unchanged for this description-only correction.
