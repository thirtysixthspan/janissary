<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the connections-tab specification's agent terminal-status sentence, which still omits Partial, to match the new outcome.

Existing Issue: The spec's row-state paragraph says an agent run record finishes as Completed, Failed, or Terminated while this change makes Partial a fourth agent terminal status and the same spec's closed-row and muted-row lists were already updated to include it. Severity: 3/10

Existing Risk: 4/10 - A later subplan or test author treats the spec's agent-status sentence as authoritative, leaves Partial out of a consumer, and ships an inconsistent status display that only a manual comparison would catch.

Proposal Risk: 1/10 - This is a documentation-only edit with no code path to regress; the only residual risk is a test that pins the old sentence verbatim, which a search of the connections spec tests would reveal.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "update the connections-tab spec's agent terminal-status sentence to include Partial". In product/specs/connections-tab.md, find the State paragraph sentence "An agent run record reads `Running` until it finishes, then `Completed`, `Failed`, or `Terminated`." and add `Partial` to that list so it matches the record outcome type and the spec's own closed-row and muted-row lists, both of which this change already updated to include Partial. Do not alter the surrounding sentences about core ACP records or live rows reading `Open`, and make no runtime changes. Verify by reading the spec back and confirming every agent terminal-status enumeration in product/specs/connections-tab.md lists the same outcomes; the existing connections row and tab tests cover the runtime behavior this sentence documents and must keep passing untouched.
