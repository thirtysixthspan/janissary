<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
