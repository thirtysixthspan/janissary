<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Document the new --no-mcp opt-out in in-app harness help so the documented command surface matches what the parser accepts.

Existing Issue: The parser now accepts --no-mcp and the behavior spec's command grammar lists it, but the in-app harness help's usage line and the command index's list of opt-out flags still omit it, so the new flag cannot be discovered from help inside the app. Severity: 3/10

Existing Risk: 3/10 - A user who needs MCP injection off cannot find the opt-out in the app's own help and either leaves it on or guesses at an undocumented flag, leaving the documented interface silently narrower than the accepted one.

Proposal Risk: 1/10 - The work changes only help strings; the parser and command builder stay untouched, so no launch behavior can regress and the existing --no-mcp parser cases keep pinning the flag's meaning.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "document the --no-mcp opt-out in in-app harness help". In help/harness.md add [--no-mcp] to the usage grammar line and add a short paragraph beside the other flag descriptions stating that MCP injection is on by default, --no-mcp opts out, and the negative form wins if both appear. In help/commands.md add --no-mcp to the harness row's list of opt-out flags. Verify by reading both help pages back against the grammar in product/specs/harness.md and the --no-mcp cases in src/harness/command-parse.test.ts, confirming every accepted harness opt-out named there appears in the in-app help and that no launch-command assertion needs to change.
