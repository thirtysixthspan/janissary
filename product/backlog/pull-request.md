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


* Make the pull request's approval and remote verification steps reproducible from the local app.

Existing Issue: The verification asks for an `ask`-worded prompt while expecting an approval panel, tells the reader to enter the remote launch command on the far host, and assigns crafted-protocol and nondeterministic bind exercises to manual steps that the app cannot perform directly. Severity: 4/10

Existing Risk: 4/10 - A reviewer can follow the steps and get different controls, launch the wrong session, or leave the remote rejection checks unverified.

Proposal Risk: 1/10 - App steps use the actual harness launch entry point and distinguish what a person can exercise from what the existing remote tests assert.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Correct the MCP PR verification actions and approval prompt". In the PR description's steps 2, 3, 5, 11 and 12, match the panel's `approve` branch in `web/src/shared/questions/QuestionPanel.tsx`, launch with `on <host>` from the local command bar, and make the background badge observation before focusing the harness again. Route protocol rejection and controlled far-side collision checks to the existing defensive assertions in `src/remote/mcp-relay.test.ts`, `src/remote/serve-mcp.test.ts`, and `src/remote/serve.test.ts` where an app action cannot drive them. Align the corresponding manual directions in `product/plans/complete/janissary-mcp-server.md` and keep the other verification steps and historical test record intact.
