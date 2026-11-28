<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Bound how long a live remote session remembers completed MCP results.

Existing Issue: The local relay keeps the text and ID of every settled MCP call until the remote channel ends. Severity: 4/10

Existing Risk: 4/10 - A long-lived session accumulates obsolete answers in memory even after the far side has no reason to re-send their calls.

Proposal Risk: 2/10 - In-flight questions and still-replayable results survive a reconnect, while expired results are reclaimed without retaining call text indefinitely.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Retire completed remote MCP results after their replay lifetime". Split in-flight state from settled replay state in `src/remote/mcp-relay.ts` and use an expiry or acknowledgement that preserves re-sends within the `src/remote/serve-mcp.ts` grace contract. Keep cleanup owned by the channel and avoid expiring an active question or replaying a result as a new question within the supported window. Extend relay tests for short in-window replays, eviction beyond the replay lifetime, and final-close cleanup. Document the supported replay lifetime in the remote-server spec.


* Correct the pull request description's stale and missing source anchors.

Existing Issue: The shared-listener refactor moved the cited manager and far-side code, and the description's verification actions have no source or test anchors of their own. Severity: 3/10

Existing Risk: 3/10 - A reader checking the guard, stored failure, or resend behavior lands on unrelated lines or has to guess where the action enters the feature.

Proposal Risk: 1/10 - The description links actions and expected outcomes to current owning code or named assertions, which can be checked again after future changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Refresh and complete MCP pull request description anchors". Update the existing code references after inspecting `src/mcp/listener.ts`, `src/mcp/manager.ts`, `src/remote/serve-mcp.ts`, the guard and their call sites. Recheck every Behavior examples transcript and every How to verify action and expectation against the current head, including the wrong test name for the original-ID assertion in step 13. Add the relevant existing named test or code anchor for each missing action or claim and preserve unrelated wording and historical test evidence. Keep the description's edit limited to evidence references.
