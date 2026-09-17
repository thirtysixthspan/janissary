# PR 1129 — split selection-layer hook tests

Complexity: 3/10

## Goal

`useSelectionLayer.test.tsx` exceeds the repository's 200-line TypeScript limit even though its event, lifecycle, and keyboard concerns form independently understandable test groups.

## Approach

Extract the shared rendered hook fixture and event helpers into a colocated test-support module, then separate lifecycle and keyboard tests into a focused test file. Keep the existing event-gesture cases in the original test module without changing their assertions.

## Implementation steps

1. Add a colocated test-support module that owns the fake terminal, rendered surface, mounting helper, and drag event helpers.
2. Move lifecycle and Escape-scoping coverage into a dedicated colocated test module that consumes the shared fixture.
3. Update the original event-gesture test module to import the fixture helpers and retain its existing coverage.

## Tests

- Existing hook gesture, empty-pick, lifecycle, and Escape tests remain unchanged in behavior.
- Run the affected client test suite through the diff check.

## Out of scope

- Changing selection-layer implementation behavior.
- Adding new selection cases.
