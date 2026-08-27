# Gather the harness client feature

**Complexity: 5/10** — this is a behavior-preserving move of four implementation modules and three colocated tests, plus two app-shell import updates and one test mock path.

## Goal

Make `web/src/harness/` the single home for the harness terminal, mounted layer, launch dialog, command builder, and their tests without introducing a barrel module or changing behavior.

## Approach

Move the harness cluster as one unit. Keep direct imports within the feature and use parent-relative imports for shared app-shell modules, the shared xterm hook, and the agent-tab metadata component. Update outside consumers to import the defining modules directly.

## Implementation steps

1. Create `web/src/harness/` and move `HarnessTab`, `HarnessTabLayer`, `HarnessLaunchDialog`, and `harness-launch-command` there with their colocated tests.
2. Update imports inside the moved modules and tests for their sibling and shared dependencies.
3. Update `AppMain` and `MountedViewLayers` to import the moved entry components, and update the mounted-layer test mock to the new direct `HarnessTab` path.

## Tests

- Run the moved harness tests and affected mounted-layer tests through `./scripts/run.mjs check-diff`; existing coverage pins terminal key filtering, metadata actions, launch-field behavior, command construction, and mounted layer behavior.

## Specs

- No functional spec change is needed because file placement and imports change without altering user-visible behavior.

## Out of scope

- Changing harness terminal, launch, metadata, or picker behavior.
- Moving shared xterm, status, picker, tab-handle, client, or agent-tab modules.
- Introducing a barrel file for the feature.
