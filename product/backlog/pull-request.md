<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the remote MCP grace window for calls already in flight when the link drops, which the new spec promises but the far-side relay never starts.

Existing Issue: The new MCP server spec says remote calls hold through a lost link for a 60-second grace window, but FarSideMcp starts its grace interval only when a call's own send returns false at dispatch, so a call delivered before the link drops has no timer and no timeout. Severity: 8/10

Existing Risk: 8/10 - A remote harness whose question is already waiting on the human loses its link and neither resumes nor fails: the tool call hangs indefinitely, the human's panel stays open, and no `Janissary is not connected.` error ever reaches the harness.

Proposal Risk: 2/10 - With grace started for every pending call on link loss, an interrupted call either resumes on reattach or fails inside 60 seconds; the remaining hazard is a re-sent call opening a second question, which the existing correlation-id dedupe already prevents.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "start the remote MCP grace window for calls already in flight when the link drops". In src/remote/serve-mcp.ts, FarSideMcp's relay starts its 60-tick grace only from the `delivered === false` branch, so calls dispatched while linked sit in `pending` with no timer; wire the link-state source used by src/remote/serve-processes.ts (the `linked` callback and send wrapper) so that a link loss calls `startGrace()` for every pending call, keeping the existing resend, `detached` flag, and `Janissary is not connected.` rejection path unchanged. Keep the correlation-id dedupe in src/remote/mcp-relay.ts so a re-sent call attaches to its existing question instead of opening a second panel. Extend src/remote/serve-mcp.test.ts with the missing case: relay a call while linked, flip the link callback to false, advance 60 seconds, and assert the executor rejects with `Janissary is not connected.`; also assert that a link restored inside the window re-sends the original call id once and answers it. Reconcile product/specs/mcp-server.md's Remote relay paragraph with the resulting behavior, and the matching grace paragraph in product/specs/remote-server.md, so no spec claims a window the code does not enforce.
