<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's ACP spec update by qualifying the role-refusal rule so it does not contradict the per-call availability gate.

Existing Issue: `product/specs/acp.md` says an included-owner command the role did not grant returns `Command not allowed for role "<role>": <subcommand>.` without noting that a disabled or agent-off command returns the disabled refusal first, so the section contradicts its own per-call gate paragraph and the ordering implemented in `src/acp/tool-table.ts`. Severity: 3/10

Existing Risk: 3/10 - A future change that follows the unqualified sentence could restore role-first refusal and silently undo the plan's ordering, leaving disabled commands reported as merely ungranted.

Proposal Risk: 1/10 - The correction is documentation-only and cannot change runtime behavior, though the section still depends on a reader noticing both the prompt-built allow-list and the per-call gate.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "qualify the ACP spec's role-refusal sentence for disabled and agent-off commands". In `product/specs/acp.md` under "Autonomous tool loop", change the sentence beginning "A known command from an included tool owner that the role did not grant..." to state that it applies to a command that is enabled and has agent access on, and that a disabled or agent-off command returns `Command is disabled: <command>.` before the role check. Clarify the preceding "Availability is read when each prompt is built" sentence to say the allow-list is built per prompt while the per-call gate re-reads current settings. Do not change code or tests; the behavior is already covered by `src/acp/tool-table.test.ts` for disabled and agent-off refusal before the role refusal, and by `src/acp/manager.test.ts` for settings re-reads and mid-prompt revocation. Verify by reading the "Autonomous tool loop" section against `src/acp/tool-table.ts` and `src/acp/run-prompt.ts` and confirming no sentence still implies the role check runs before the availability check.
