<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap where harnesses refused on a failed far-side MCP endpoint get no explanation for the refusal.

Existing Issue: After a bind collision the shared endpoint stays failed and later harness spawns with MCP get exit code 1 from the spawn catch while only the harness that lost the race receives an output frame naming the bind failure. Severity: 4/10

Existing Risk: 4/10 - A user opening another harness tab on the same remote session sees it close immediately with no reason in its own tab and cannot tell MCP is unavailable without reading an earlier tab's output.

Proposal Risk: 1/10 - Every refused harness receives the stored reason in its own tab before the exit, and the original report on the colliding harness's tab stays unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "report the bind-failure reason to every harness refused on a failed far-side MCP endpoint". In src/remote/serve-mcp.ts, give launch() an optional requesting process id that defaults to the constructor's id, and when failure is set send an output frame addressed to that id carrying the stored failure string before throwing. In src/remote/serve-processes.ts, pass frame.id to launch() at the shared-endpoint call in spawnPty so the refusal is addressed to the harness that asked, not to the original endpoint creator. In src/remote/serve-mcp.test.ts, add a case that drives a real collision through a FarSideMcp instance and asserts that a later launch emits the output reason before throwing; in src/remote/serve.test.ts assert that the spawn catch turns that throw into an exit code 1 for the second harness. Leave the existing collision case and the four mocked cases untouched, since they pin the loopback, guard, token, relay and cancellation behavior.
