<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Add colocated tests for the two-state MCP metadata flag, closing the technical debt of unverified flag states and tooltips.

Existing Issue: The commit adds the `mcpFlag` derivation and the `mcp`/`mcpInUse` display entries with spec-pinned tooltip strings and a green in-use state but no test in either test file, where every analogous flag has colocated coverage. Severity: 3/10

Existing Risk: 4/10 - A wrong tooltip string, a missing green highlight, or a regression in the plain-to-in-use derivation ships unnoticed because nothing pins the two MCP states, so the metadata row can contradict the spec without any test catching it.

Proposal Risk: 1/10 - Tests only assert the existing mapping and green class and change no behavior, and the neighboring flag tests show the pattern is low-risk to extend.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "add colocated tests for the two-state MCP metadata flag". In `src/tab/view.test.ts`, add cases beside the browser-flag tests: a harness tab with `mcp` set and no `mcpUsed` reports `mcp`, one with `mcpUsed` set reports `mcpInUse` in its place, and a tab without `mcp` reports neither even when `mcpUsed` is set. In `web/src/harness/HarnessTabMeta.test.tsx`, add cases beside the browser flag tests: `flags={['mcp']}` renders a server glyph with accessible name and title "MCP server" and no `tab-flag--active`, and `flags={['mcpInUse']}` renders the same glyph with name and title "MCP server in use" and the `tab-flag--active` class. Leave the existing flag tests and the production mapping untouched; they cover the surrounding rendering and must keep passing.
