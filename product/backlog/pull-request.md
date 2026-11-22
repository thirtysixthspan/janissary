<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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

