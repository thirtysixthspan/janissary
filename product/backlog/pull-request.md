<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan-fidelity gap where the monitor spec still documents the removed harness directive and persona web-tools opt-in.

Existing Issue: product/specs/monitoring.md still describes a persona's first line as a `[//]: # <harness>:<model>:<variant>` directive and a second `[//]: # tools:` line that grants `web_search`/`web_fetch`, including the old unknown-tool error, although this change removed both from the format and from every shipped persona. Severity: 6/10

Existing Risk: 6/10 - A contributor follows the spec, writes a persona in the old format, and either gets a hard load failure from the new role-directive parser or silently gets the tools line treated as body text with no web access granted.

Proposal Risk: 2/10 - The spec then matches the shipped role-directive format, with the only residual hazard that a later change to how roles grant web access could stale the prose again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "update the monitor spec to describe the role directive instead of the removed harness and tools lines". Rewrite the "Persona web tools" section of product/specs/monitoring.md so it no longer shows a `[//]: # claude:Sonnet:high` example or a `[//]: # tools: web_search, web_fetch` opt-in, and remove the claim that an unknown tool name fails persona load with the old `requests unknown tool` error; state instead that a persona's first line is `[//]: # role:<name>`, that every shipped persona names the `ask` role, and that web access now comes from the role's `commands` rather than a persona-file directive, noting that the default `ask` role in src/plugins/roles/default-roles.ts grants `web search` and `web fetch`. Update the page's opening summary that says a persona may opt into a small fixed set of web tools so it reflects the role-based grants. Leave the in-application help pages under help/ untouched because none describe the persona file format, and do not touch the documentation/ trees, which update-documentation.md owns. No code behavior changes are involved; the colocated persona and launcher tests already pin the parsed role and the absence of a tools line and must keep passing untouched.


* Address the plan-fidelity gap where the persona parser still exports the legacy harness type the subplan required deleting.

Existing Issue: The subplan's first implementation step requires deleting `PersonaHarness`, but src/persona-parsing.ts still exports it with its harness/model/variant fields, so the parser module continues to carry the old format's type beside the new role parser. Severity: 4/10

Existing Risk: 4/10 - A future caller can import the obsolete harness shape from the persona parser and reintroduce the harness/model/variant coupling the role format deliberately removed, and a later subplan that deletes the type from that module breaks src/acp/launch.ts, its only importer.

Proposal Risk: 2/10 - Relocating the type to its only consumer keeps the legacy shape local to the one helper that still needs it, while the persona parser and the `Persona` contract become clean and the cross-module dependency disappears.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "move the legacy PersonaHarness type out of the persona parser to its only consumer". Define the `PersonaHarness` type locally in src/acp/launch.ts next to `acpLaunchFor`, remove its definition and export from src/persona-parsing.ts, and drop the now-unused type import there; src/acp/launch.ts is the only importer, so no other call site changes. Leave src/monitor/acp.ts, which now resolves the role through `readRoleSettings` and `acpLaunchForEntry`, untouched. Verify with the existing persona and monitor ACP tests, which must keep passing unchanged; no test detects a stale type-only export, so also read src/persona-parsing.ts and confirm only the role prefix and `parseRoleDirective` remain.


* Record the technical-debt gap where editor-suggest test mocks still build personas with the removed harness and tools fields.

Existing Issue: src/editor-suggest/handler.test.ts builds `loadPersona` mocks in the deleted `{ name, harness, body, tools }` shape in nine places, although the `Persona` contract in src/personas.ts is now `{ name, role, body }` and the loader no longer returns harness or tools. Severity: 3/10

Existing Risk: 3/10 - A future assertion that a mocked persona carries a role reads `undefined`, so a test can pass for the wrong reason or fail puzzlingly, and the fixtures teach the next contributor the obsolete shape.

Proposal Risk: 1/10 - The fixtures then match the live `Persona` type; this would be wrong only if some test actually asserted harness or tools forwarding, which a read of the file shows none does.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "update the editor-suggest test mocks to the role-based Persona shape". Replace every `mocks.loadPersona.mockReturnValue(...)` fixture in src/editor-suggest/handler.test.ts with `{ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' }`, dropping the `harness` and `tools` fields, so the fixtures match the `Persona` type defined in src/personas.ts. No production code changes are needed: src/editor-suggest/handler.ts reads only `name` and `body`, and the `spawnMonitorSession` factory is mocked in this file, so the existing assertions must keep passing unchanged. Search the whole file for fixtures still in the old shape rather than editing only the first one.

