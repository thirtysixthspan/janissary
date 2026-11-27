<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Carry each remote harness's MCP launch decision through a session attach so the rebuilt tab shows the right MCP flag.

Existing Issue: `startSessionAttach` in `src/sessions/attach.ts` calls `attachRemote` with no `mcp` field and `offline: false`, and `RemoteProcessState` and `spawnFrameState` carry no `mcp`, so `HarnessTabSpawn.spawnTab` marks the rebuilt tab `mcp` whenever the local server is running, even for a far harness launched with `--no-mcp` or `--offline` that has no MCP config, and hides the flag for an MCP harness when the local server is down. Severity: 3/10

Existing Risk: 3/10 - After an Attach the metadata row claims MCP for a harness that cannot reach any server, or denies it for one that can, contradicting the tabs spec's rule that a tab not launched with MCP config shows no MCP flag.

Proposal Risk: 1/10 - The flag reports the far process's real launch, leaving only the already documented reset of the in-use green to plain across an attach.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "carry the remote spawn's mcp flag into the session record and the attach path". Add `mcp?: boolean` to `RemoteProcessState` in `src/remote/protocol-frames.ts` and copy it in `spawnFrameState` in `src/remote/process-state.ts` the way `autoApprove` is copied; in `src/sessions/attach.ts` read it (and the recorded `offline`) from the matching process and pass it to `attachRemote`. In `src/harness/tab-spawn.ts`, for an attach (`options.resumePtyId` set) take `tab.mcp` from the recorded flag rather than from `localLaunch()`, since the far side already holds its endpoint. Check the session-state decoder accepts the new optional field, add a codec round-trip case in `src/remote/protocol.test.ts`, and add tests that an attach of a process recorded with `mcp: false` yields `tab.mcp === false` while the local server runs and one recorded with `mcp: true` yields `true`. The existing `src/harness/tab-spawn.test.ts` launch-decision cases must keep passing.


* Make a corrupt or unreadable MCP state file a reported, recoverable failure and document it.

Existing Issue: A `.janissary/mcp.json` that fails to parse or decode keeps the server down on every start with the reason `invalid MCP state file`, which names no file and suggests no fix, and `product/specs/mcp-server.md` describes neither this edge case nor its exact message. Severity: 3/10

Existing Risk: 3/10 - A truncated or hand-mangled state file silently disables MCP for every harness in the project until someone guesses which file to delete, since the notification and the `mcp` command both show only the bare reason.

Proposal Risk: 1/10 - The reason names the file and the spec states the behavior, so the only remaining cost is the manual deletion the user is now told about.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "name the state file in the invalid-MCP-state failure and document the corrupt-file edge case". In `src/mcp/manager.ts`, change `loadState`'s decode-failure and read-failure reasons to include the state file path (for example `invalid MCP state file <path>; delete it to pick a new port and token`), and add the case to the Server section of `product/specs/mcp-server.md` with the exact text, stating that the server stays down and Janissary runs normally. Add a test to `src/mcp/manager.test.ts` that writes invalid JSON to the state file and asserts one `mcp-failed` notification whose message contains the path and that `status()` reports the same reason. The existing taken-port test in that file must keep passing.


* Remove the forged Managers and Tab objects the MCP manager builds to record its failure notification.

Existing Issue: `McpManager.recordFailure` builds a fake `Managers` with `Object.create(managers)`, a fake tab manager with `Object.create(managers.tab)`, and a `cur()` returning `{ label: 'janus', dotColor: undefined } as unknown as Tab`, only so `notify` can read an active label during a synchronous failure inside `createManagers`. Severity: 3/10

Existing Risk: 3/10 - Any change to `notify` or `deliverNotification` that writes a field on `managers` or its tab manager, or reads more of the cast `Tab`, silently writes into the shadow object or reads undefined, losing or corrupting the one failure notice the user gets.

Proposal Risk: 1/10 - The failure is recorded through the ordinary `notify` path once managers exist, so the only remaining dependency is the documented construction order.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "record the MCP start failure without forging Managers or a Tab". In `src/mcp/manager.ts`, make `start` yield before doing any work (for example by awaiting a resolved promise or `setImmediate`) so even a synchronous state-file failure reaches `recordFailure` after `createManagers` in `src/controller/create-managers.ts` has finished and the root tab exists, then delete the `Object.create` fallback and call `notify(managers, 'mcp-failed', 'janus', detail)` directly; if a path can still run with no current tab, give `notify` in `src/notifications/index.ts` a documented fallback for a missing `cur()` instead. Keep exactly one notification. The taken-port test in `src/mcp/manager.test.ts` pins the notification shape and must keep passing; add a test that a corrupt state file still produces one `mcp-failed` notification through a real `createManagers` call in `src/controller/create-managers.test.ts`.


* Correct the pull request description's claim that a call made while detached is rejected at once.

Existing Issue: The description says "a call made while detached is rejected before any frame is sent with `Janissary is not connected.`", but `FarSideMcp.relay` rejects only after a grace window has already expired with no link; a call made in the first 60 seconds after a Detach, or after a Detach with no call pending, is held and waits a full window before it fails. Severity: 3/10

Existing Risk: 3/10 - A reviewer or tester who relies on the sentence expects an immediate failure after Detach, sees a 60-second hold, and either files the correct behavior as a bug or approves a boundary the code does not draw.

Proposal Risk: 1/10 - The description matches the spec's wording, so only the inherent subtlety of the two-phase refusal remains for a reader.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "correct the description's claim that a call made while detached is rejected at once". Rewrite that sentence in the pull request body's What section to match `product/specs/mcp-server.md`: a call made while the link is down waits like one in flight, and only once a grace window has expired with no link do new calls fail at once with `Janissary is not connected.` until a link returns. Anchor it to `FarSideMcp.relay` in `src/remote/serve-mcp.ts` and to the tests "holds in-flight and new calls through a link loss and re-sends them when it returns" and "fails a call made while detached at once with the detach error" in `src/remote/serve-mcp.test.ts`. Make no code change.


* Report a far-side MCP bind failure once to the harness that collided, not twice.

Existing Issue: `FarSideMcp`'s `error` listener sends the bind-failure `output` frame to its constructing harness's id, and `launch(frame.id)` then sends the same stored reason to that same id again, so the first colliding harness's tab shows `MCP endpoint could not bind ...` twice. Severity: 2/10

Existing Risk: 2/10 - The duplicate line is confusing but harmless, and it contradicts the spec's statement that the first harness's report is unchanged while later harnesses receive the stored reason.

Proposal Risk: 1/10 - Each harness gets exactly one line, so the only remaining risk is a later caller bypassing `launch`, which a count assertion would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "send the far-side MCP bind failure once per harness". In `src/remote/serve-mcp.ts`, stop the constructor's `error` listener from sending an `output` frame and let `launch(id)` be the only sender of the stored reason, or track which ids have been told and skip a repeat; either way every refused harness still receives the reason before `RemoteServer.spawn` emits exit code 1. Tighten "reports a real port collision without crashing the session" in `src/remote/serve-mcp.test.ts` and "reports a failed shared MCP endpoint to a later harness before exiting it" in `src/remote/serve.test.ts` to assert exactly one `output` frame for `r1` and one for `r2`.


* Correct the description's How to verify step that asks the reader to stop the local MCP server.

Existing Issue: How to verify step 9 says "stop the local MCP server before a third launch", but nothing in the app stops a running server (the `mcp` command only reports status), and the test it cites for that case covers a remote launch rather than the local launch the step describes. Severity: 2/10

Existing Risk: 2/10 - A tester cannot perform the step as written and may report the server-down launch path as unverified or improvise a different setup.

Proposal Risk: 1/10 - The step describes a setup that exists and cites the matching test, leaving only the usual gap between a test and a manual run.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "make How to verify step 9's server-down launch performable and anchor it to the local test". Edit the pull request body so the third launch is set up the way the server can actually be down, by holding the persisted MCP port with another process before starting the app (as step 10 does), and cite "passes no MCP variables or fragment while the local server is down" in `src/harness/tab-spawn.test.ts` beside the existing remote test. Make no code change.


* Correct the description's code anchors that point at lines which do not hold the cited behavior.

Existing Issue: Several of the description's line anchors miss their claims: `src/mcp/manager.ts:159-162` for the failure notification and `src/mcp/manager.ts:98-99` for the `mcpPort` override (both the constructor or unrelated lines, while the logic is in `start` and `recordFailure`), `src/remote/serve-mcp.ts:167-170` for the detached refusal and `:167-181` for sending `mcp-call` (the link watcher, while both are in `relay`), `src/remote/serve-mcp.ts:91-97` for replaying the stored reason (the `listening` handler, while the replay is in `launch`), and the off-by-a-few `src/remote/protocol.ts:277` and `src/remote/entry-factory.ts:159`. Severity: 2/10

Existing Risk: 2/10 - A reviewer who follows an anchor lands on unrelated code and either wastes time or concludes the claim is unsupported.

Proposal Risk: 1/10 - Anchors that name the right function and a test stay checkable, leaving only the ordinary drift of line numbers as the branch moves.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "correct the description's line anchors that miss their claims". In the pull request body, replace each anchor listed above with the lines at the current head that hold the behavior: `recordFailure` and the final catch of `start` in `src/mcp/manager.ts` for the failure notice, the `getConfig().mcpPort ?? state?.port` line of `start` for the override, `relay` in `src/remote/serve-mcp.ts` for the detached refusal and the `mcp-call` send, `launch` for the stored-reason replay, the `REMOTE_PROTOCOL_VERSION = 49` line in `src/remote/protocol.ts`, and the `onFinalClose` line in `src/remote/entry-factory.ts`. Where a named test already pins the claim, keep the test anchor beside the line. Make no code change.


* Correct the harness help page's description of the MCP opt-out, which refers to a positive form that does not exist.

Existing Issue: `help/harness.md` says "`--no-mcp` opts out, and the negative form wins if both forms appear", but the command has no documented positive MCP flag (an `--mcp` token is silently ignored like any unknown word), and the page never says that `--offline` also turns MCP off. Severity: 2/10

Existing Risk: 2/10 - A user reading the in-app help looks for an `--mcp` flag that is not in the usage line, and cannot learn from the help alone why an offline harness has no `janissary` server.

Proposal Risk: 1/10 - The help states only flags that exist and the offline rule the spec already gives, leaving nothing for a reader to misread.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "correct the harness help's MCP opt-out sentence". Rewrite the closing MCP sentence of `help/harness.md` to say that MCP is on by default, that `--no-mcp` opts out, and that an `--offline` launch, or one made while the local MCP server is not running, gets no MCP config, matching the MCP server config section of `product/specs/harness.md`. Leave the usage line alone. `src/commands.test.ts` reads the help pages and must keep passing; make no code change.
