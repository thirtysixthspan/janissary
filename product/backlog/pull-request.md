<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's tab busy guarantee across concurrent shell activity.

Existing Issue: The plan promises the tab stays busy until ask and tell prompts settle, but shell completion and ACP settlement both clear the shared busy flag without accounting for the other active operation. Severity: 4/10

Existing Risk: 4/10 - A shell command can finish while an ACP prompt is still active, leaving the tab's busy indicator off while model output is arriving; ACP can also settle while a shell command is still running.

Proposal Risk: 2/10 - Source-owned busy activity would prevent one operation from releasing another's state, though an unmatched acquire or release could still leave the indicator wrong.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "preserve tab busy state across concurrent ACP and shell work". Replace the shared busy flag's unconditional release with source-owned activity tracking in `src/tab/types.ts`, `src/tab/runtime-operations.ts`, and `src/tab/transcript/events.ts`, while keeping the existing boolean projection for tab views. Have `src/shell/manager.ts` acquire and release one owner for each running shell command, and have each ACP pending prompt acquire and release its own owner through `src/acp/manager.ts` and `src/acp/response.ts`; a release must affect only its own operation. Add a focused integration case beside the real tab and ACP fixtures in `src/acp/record-feed.test.ts`: run ask and tell prompts with a shell command, settle the shell first and verify busy remains until both prompts settle, then cover the reverse completion order and verify busy remains until the shell finishes.
