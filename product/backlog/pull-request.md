<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's stale and missing source anchors.

Existing Issue: The shared-listener refactor moved the cited manager and far-side code, and the description's verification actions have no source or test anchors of their own. Severity: 3/10

Existing Risk: 3/10 - A reader checking the guard, stored failure, or resend behavior lands on unrelated lines or has to guess where the action enters the feature.

Proposal Risk: 1/10 - The description links actions and expected outcomes to current owning code or named assertions, which can be checked again after future changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Refresh and complete MCP pull request description anchors". Update the existing code references after inspecting `src/mcp/listener.ts`, `src/mcp/manager.ts`, `src/remote/serve-mcp.ts`, the guard and their call sites. Recheck every Behavior examples transcript and every How to verify action and expectation against the current head, including the wrong test name for the original-ID assertion in step 13. Add the relevant existing named test or code anchor for each missing action or claim and preserve unrelated wording and historical test evidence. Keep the description's edit limited to evidence references.
