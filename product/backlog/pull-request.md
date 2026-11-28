<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Require an MCP-enabled harness before its remote channel can deliver a question call to the local app.

Existing Issue: `createRemoteEntry` dispatches MCP calls on every channel regardless of whether the session contains a harness authorized to use MCP. Severity: 6/10

Existing Risk: 6/10 - A remote session with no MCP-enabled harness can exercise a local question capability the user opted out of granting.

Proposal Risk: 2/10 - A session with an eligible harness keeps its existing shared-endpoint access, including when that harness is restored from its launch record.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Gate incoming MCP calls on the remote harness launch decision". Use locally known harness spawn state from `src/remote/channel/index.ts` and the recorded attach path in `src/harness/tab-spawn.ts` to authorize MCP dispatch in `src/remote/entry-factory.ts`. Refuse calls before the relay executor is invoked when the session has no eligible harness, without losing cancellation and cleanup for a call already accepted. Preserve explicit cross-tab targeting for an allowed caller and make the existing fake-channel success cases in `src/remote/manager.test.ts` register an eligible harness. Add a defensive test that a channel lacking the grant leaves the question queue untouched, and record the channel policy in the remote and MCP specs.


* Clear ambient MCP credentials from a harness launch when MCP injection is disabled.

Existing Issue: A launch with MCP disabled omits the MCP overlay, but the underlying PTY environment still inherits any existing MCP variables from the launching process on the pass-through sandbox path. Severity: 5/10

Existing Risk: 5/10 - An opted-out or offline harness in a nested Janissary process can retain another session's MCP credentials and tab name.

Proposal Risk: 2/10 - Launches gain these variables only through the application's current launch decision, while other PTY environment and explicitly enabled MCP are preserved.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Remove inherited MCP variables from opted-out harness launches". Trace `harnessSpawnEnv` in `src/harness/scratch-dir.ts`, the merge in `src/pty.ts`, and unconfined and confined environment handling in `src/sandbox/index.ts` and `src/sandbox/environment.ts`. Strip inherited MCP URL, token and tab identity at the launch boundary before overlaying an explicitly configured endpoint, including for far-side harnesses. Keep unrelated env keys and the browser and Claude launch overrides. Verify the effective spawn environment with a harmless ambient fixture for local and remote opt-out, then prove an enabled launch still gets the endpoint it was assigned. Update the harness spec.


* Bound how long a live remote session remembers completed MCP results.

Existing Issue: The local relay keeps the text and ID of every settled MCP call until the remote channel ends. Severity: 4/10

Existing Risk: 4/10 - A long-lived session accumulates obsolete answers in memory even after the far side has no reason to re-send their calls.

Proposal Risk: 2/10 - In-flight questions and still-replayable results survive a reconnect, while expired results are reclaimed without retaining call text indefinitely.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Retire completed remote MCP results after their replay lifetime". Split in-flight state from settled replay state in `src/remote/mcp-relay.ts` and use an expiry or acknowledgement that preserves re-sends within the `src/remote/serve-mcp.ts` grace contract. Keep cleanup owned by the channel and avoid expiring an active question or replaying a result as a new question within the supported window. Extend relay tests for short in-window replays, eviction beyond the replay lifetime, and final-close cleanup. Document the supported replay lifetime in the remote-server spec.


* Put the cancellation frame into the protocol's exhaustive round-trip fixture.

Existing Issue: `src/remote/protocol.test.ts` adds `mcp-cancel` to the protocol and standalone test but leaves it out of `FULLY_POPULATED_FRAMES`, whose mapped type requires every frame. Severity: 3/10

Existing Risk: 3/10 - Type-aware checks of the test fail and the exhaustive suite silently omits the new frame during normal transpiled execution.

Proposal Risk: 1/10 - The generic suite checks the new frame while the focused cancellation and rejection assertions still pin its special cases.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "Add mcp-cancel to the exhaustive codec fixture". Add a fully populated cancellation frame to `FULLY_POPULATED_FRAMES` in `src/remote/protocol.test.ts`. Check the admitted-frame, malformed-frame, version-49 and base64 assertions and verify the new case runs through the normal table. This change reinforces the existing wire contract described in `product/specs/remote-server.md`.


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
