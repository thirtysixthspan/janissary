<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Record the technical-debt gap where editor-suggest test mocks still build personas with the removed harness and tools fields.

Existing Issue: src/editor-suggest/handler.test.ts builds `loadPersona` mocks in the deleted `{ name, harness, body, tools }` shape in nine places, although the `Persona` contract in src/personas.ts is now `{ name, role, body }` and the loader no longer returns harness or tools. Severity: 3/10

Existing Risk: 3/10 - A future assertion that a mocked persona carries a role reads `undefined`, so a test can pass for the wrong reason or fail puzzlingly, and the fixtures teach the next contributor the obsolete shape.

Proposal Risk: 1/10 - The fixtures then match the live `Persona` type; this would be wrong only if some test actually asserted harness or tools forwarding, which a read of the file shows none does.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "update the editor-suggest test mocks to the role-based Persona shape". Replace every `mocks.loadPersona.mockReturnValue(...)` fixture in src/editor-suggest/handler.test.ts with `{ name: 'reviewer', role: 'ask', body: 'Watch for bugs.' }`, dropping the `harness` and `tools` fields, so the fixtures match the `Persona` type defined in src/personas.ts. No production code changes are needed: src/editor-suggest/handler.ts reads only `name` and `body`, and the `spawnMonitorSession` factory is mocked in this file, so the existing assertions must keep passing unchanged. Search the whole file for fixtures still in the old shape rather than editing only the first one.

