<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the harness help page's description of the MCP opt-out, which refers to a positive form that does not exist.

Existing Issue: `help/harness.md` says "`--no-mcp` opts out, and the negative form wins if both forms appear", but the command has no documented positive MCP flag (an `--mcp` token is silently ignored like any unknown word), and the page never says that `--offline` also turns MCP off. Severity: 2/10

Existing Risk: 2/10 - A user reading the in-app help looks for an `--mcp` flag that is not in the usage line, and cannot learn from the help alone why an offline harness has no `janissary` server.

Proposal Risk: 1/10 - The help states only flags that exist and the offline rule the spec already gives, leaving nothing for a reader to misread.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "correct the harness help's MCP opt-out sentence". Rewrite the closing MCP sentence of `help/harness.md` to say that MCP is on by default, that `--no-mcp` opts out, and that an `--offline` launch, or one made while the local MCP server is not running, gets no MCP config, matching the MCP server config section of `product/specs/harness.md`. Leave the usage line alone. `src/commands.test.ts` reads the help pages and must keep passing; make no code change.
