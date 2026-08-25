# Gather the command-input client feature

**Complexity: 5/10** — this is a behavior-preserving move of nine implementation modules and their colocated tests, plus three app-shell import updates. The shared drop-handle contract and the search bar remain in their existing shared locations.

## Goal

Make `web/src/command-input/` the single home for the command-input feature so its components, hooks, pure helpers, and tests are discoverable together without creating a barrel module or changing behavior.

## Approach

Move the command-input cluster as one unit. Use relative imports within the new directory and retain direct imports for callers outside it. The feature continues to consume shared `icons`, `drop-handles`, and `ws` modules from the parent directory. This keeps the feature boundary explicit while preserving the established direct-import convention.

## Implementation steps

1. Create `web/src/command-input/` and move `CommandInput`, `CommandArea`, `useCommandHistoryRecall`, `command-caret-lines`, `command-completion`, `ghost-suggestion`, `textarea-splice`, `command-interceptions`, and `useCommandBarSubmit` there with their colocated tests.
2. Update imports inside the moved modules to point at their new sibling or parent locations, including shared icons, drop handles, the search bar, transcript search hook, and WebSocket client.
3. Update the app-shell importers so `AgentTabBody`, `InactiveAgentTabBody`, and `App` import the feature's direct entry modules from `command-input/`.

## Tests

- Run the moved command-input test suite through `./scripts/run.mjs check-diff`; its existing tests cover history recall, completion, ghost suggestions, caret handling, interception, textarea edits, submission, and the rendered command input after their import paths change.

## Out of scope

- Moving `history.ts` or `populate-command-line.ts`, which have multiple consumers outside this feature.
- Moving shared `icons.ts`, `drop-handles.ts`, `ws.ts`, `SearchBar.tsx`, or `useTranscriptSearch.ts`.
- Changing command-input behavior or introducing a barrel file.
