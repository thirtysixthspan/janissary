<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap where the local relay runs any remote `mcp-call` as a question without checking the tool name or re-validating its arguments.

Existing Issue: The local relay hands every decoded `mcp-call` to the local question executor whatever its `tool` field says, and the executor casts the parsed arguments to `QuestionArgs` without checking that `tab`, `kind`, `question` and `options` have the right types, so the only validation a remote call ever gets is the far side's own. Severity: 4/10

Existing Risk: 3/10 - A far-side process that sends a crafted frame (an object as the question, numbers as options, an unknown kind, or a future tool name) reaches `Questions.register` and the wire `PendingQuestionView` unchecked, which can break the local question panel's rendering and will silently run a question when a second registry tool is added.

Proposal Risk: 1/10 - The local process validates what it executes, so the remaining exposure is only whatever the shared validator itself misses, which a test on each rejected shape would show.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "validate the tool name and arguments of relayed mcp-call frames on the local side before executing them". In `src/remote/mcp-relay.ts`, after the existing non-object check in `handle`, refuse a `frame.tool` that is not the name of an entry in `TOOLS` from `src/mcp/tools.ts` with an `isError` `mcp-result` (for example `Unknown MCP tool "<tool>".`) and register nothing, then run `validateQuestionArgs` from `src/mcp/question-tool.ts` on the parsed object and answer its `error` text as an `isError` result, again before any `AbortController` or pending entry is created, so a rejected call leaves its id unclaimed exactly as the malformed-arguments path does. Tighten `validateQuestionArgs` so every `options` element must be a string (answered with the existing `approve needs at least one option.` text or a new exact text added to `QUESTION_ERROR` and `product/specs/mcp-server.md`), since relayed arguments never pass through the SDK's zod schema, while a non-string `tab` keeps resolving as the empty name and returning `No tab named "".`; the local HTTP path keeps its current behavior because zod already enforces those types there. Add cases to `src/remote/mcp-relay.test.ts` for an unknown tool, a non-string question, a non-string option and an unknown kind, each asserting the exact error text, no `register` call, and that a later valid call with the same id registers; the existing malformed-argument and re-send tests in that file and the four exact-text tests in `src/mcp/question-tool.test.ts` must keep passing unchanged.


* Handle frames that arrive while an MCP harness spawn is still waiting for its endpoint to bind, so a kill, input, resize or shutdown in that window is not lost.

Existing Issue: `RemoteProcesses.spawn` now awaits `FarSideMcp.launch()` before it inserts the entry, so a `kill`, `input` or `resize` for that id, or a `killAll` from shutdown, that is processed during the await finds no entry and is dropped, and the PTY is spawned afterwards anyway; the duplicate-id guard is also checked only before the await. Severity: 4/10

Existing Risk: 3/10 - A tab closed or a session shut down right after an MCP harness launch leaves a harness process running on the remote host with nothing local attached to it, and early keystrokes are silently discarded.

Proposal Risk: 1/10 - A pending-spawn record makes every frame in the window either apply after the spawn or cancel it, leaving only ordinary spawn failures, which the existing exit-code-1 path already reports.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "make the far side honor kill, input, resize and killAll that arrive while an MCP spawn awaits its endpoint bind". In `src/remote/serve-processes.ts`, record an id in a pending-spawn map before awaiting `endpoint.launch(frame.id)` and treat a second spawn with that id as a duplicate; have `kill(id)` and `killAll()` mark a pending id cancelled so the continuation skips `spawnPty` and emits `{ type: 'exit', id, exitCode: 1 }` (or nothing for `killAll`, matching how it ends live entries), and buffer `input` and the latest `resize` for a pending id and replay them once the entry exists. Also check after the await that `this.mcp` is still the endpoint that was awaited, since `killAll` disposes it. Restore the comment above `spawnPty`'s environment build so it states how the await is made safe instead of only that the bind is awaited. Add tests to `src/remote/serve-mcp.test.ts` that hold the `listening` event (the `httpMock.server.on` fake already allows that), send `kill`, `input` and `killAll` during the hold, then release it and assert no `spawnPty` call for the killed id and that buffered input reaches the writer for the live one. The non-MCP synchronous path pinned by `src/remote/serve-processes.test.ts` and the collision tests in `src/remote/serve-mcp.test.ts` and `src/remote/serve.test.ts` must keep passing unchanged.


* Draw the far-side MCP endpoint's port from the shared reachable-port pool instead of a private copy of the allocator.

Existing Issue: `src/remote/serve-mcp.ts` has its own `claimPort`, its own `reserved` set, and hard-coded `FIRST_PORT` and `PORT_COUNT = 16_128` duplicating `src/browser/e2e-ports.ts`, so a remote `-b` harness's browser guard, allocated in the same `remote-serve` process from the same 49152 to 65279 range, can be handed the port the MCP endpoint is listening on. Severity: 4/10

Existing Risk: 3/10 - A far-side browser guard that draws the endpoint's port fails to bind and tears down that tab's browser, which is exactly the collision the local manager's fix avoided by sharing the pool, and the duplicated band arithmetic will drift if the browser band ever moves.

Proposal Risk: 1/10 - One allocator and one reservation set serve both consumers, so the only remaining collision is with a foreign process, which the endpoint already reports as a contained bind failure.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "make FarSideMcp claim its port through reserveReachablePort so far-side browser guards cannot take it". In `src/remote/serve-mcp.ts`, delete the local `FIRST_PORT`, `PORT_COUNT`, `reserved` and `claimPort`, call `reserveReachablePort()` from `src/browser/e2e-ports.ts` in the constructor, keep the returned `release` on the instance, and call it from `dispose()` in place of `reserved.delete(this.port)`. Keep throwing when the pool is exhausted so `RemoteProcesses.spawn` still turns that into the exit-code-1 path. The collision tests in `src/remote/serve-mcp.test.ts` and `src/remote/serve.test.ts` force the port through a mocked `randomInt`; `reserveReachablePort` normalizes a draw with `claimPort`, so confirm those tests still land on the blocked port (a draw inside the guard range maps to itself) and adjust only the fixture if not. Add a test that constructs a `FarSideMcp` with `randomInt` forced to a value, then calls `allocateBrowserPorts()` with the same forced value and asserts the guard port differs from the endpoint's, mirroring `src/mcp/manager-port.test.ts`.


* Stop a first start with an `mcpPort` override from persisting the override as the project's saved port.

Existing Issue: When `.janissary/mcp.json` does not exist and `mcpPort` is set, `McpManager.start` binds the override and then saves `{ port: <override>, token }`, so the hand-edited port becomes the persisted one and keeps being used after the override is removed, contrary to the plan's preserved behavior that an override binds "without being written back" and to the reachable first-start draw. Severity: 4/10

Existing Risk: 4/10 - A user who briefly sets `mcpPort` (for example to a port in the 65280 to 65535 band, or one that later conflicts) and then deletes the key keeps that port forever, so confined harnesses cannot reach the server or it fails to start, with nothing pointing back at the old override.

Proposal Risk: 1/10 - The override stays a pure runtime choice and the saved port is always one the reachable draw produced, so only a hand-edited `mcp.json` can still pin an unusual port.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "never persist an mcpPort override as the saved MCP port on a first start". In `src/mcp/manager.ts`, when there is no saved state and `getConfig().mcpPort` is set, persist the token without a port (make `port` optional in `State` and `decodeState`, so a token-only file is valid), and leave the port to be drawn with `reserveReachablePort()` and saved on the first start that runs without an override; a start with saved state keeps today's behavior. Add a test to `src/mcp/manager.test.ts` that sets `mcpPort` with no state file, starts and disposes, then clears `mcpPort` and starts again, asserting the second start's port is not the override, lies below `BROWSER_PORT_BAND_FIRST`, reuses the first start's token, and is what `mcp.json` now holds. The existing "persists the chosen port and token", "uses mcpPort instead of the saved port without writing it back" and taken-port tests in that file must keep passing, and `product/specs/mcp-server.md` should say an override is never saved.


* Reserve a saved or overridden MCP port in the shared pool on every start, not only on the first.

Existing Issue: `McpManager.start` reserves its port in the shared `reserved` set only when it draws a fresh one; on every later start the saved port, and any `mcpPort` override, is bound with a no-op `release` and never entered into the set, so browser guards in the same process can still draw the port the server is listening on. Severity: 3/10

Existing Risk: 3/10 - On any start after the first, a `-b` harness launch has a small chance of drawing the MCP server's port for its guard, whose bind then fails and tears down that tab's browser, which is the collision requirement 6a's shared reservation exists to prevent.

Proposal Risk: 1/10 - The server's port is reserved for its lifetime however it was chosen, so only a foreign process can still collide, which the guard already reports.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "reserve a saved or overridden MCP server port in the shared browser-guard pool". In `src/browser/e2e-ports.ts`, add an exported helper beside `reserveReachablePort` that reserves a specific port (adding it to `reserved` only when it is not already there, and returning a `release` that deletes it only if this call added it), and in `src/mcp/manager.ts` use it for the `configured` branch instead of `{ port: configured, release: () => {} }`, keeping the existing release calls on a failed bind, a disposal before publication and a persistence failure. A port outside the guard range can be reserved harmlessly because nothing else draws it. Add a case to `src/mcp/manager-port.test.ts` that writes a saved state naming a guard-range port, starts the manager, forces `randomInt` to that port and asserts `allocateBrowserPorts().guardPort` differs from it; the existing reuse and override tests in `src/mcp/manager.test.ts` must keep passing.


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
