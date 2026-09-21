# Replace file-navigator drag positional arguments with named options

**Complexity: 5/10** — one hook signature and caller migration, plus its direct hook tests. Drag behavior and destination contracts remain unchanged.

## Goal

The file navigator drag hook accepts one named options object instead of incompatible positional call forms, so paths, refs, and the optional remote host are unambiguous at every call site.

## Implementation

1. Define and export the hook's options type beside `useFileNavigatorDrag`, remove legacy runtime detection and compatibility defaults, and read all inputs from the named object.
2. Change `FileNavigatorTab` to pass named drag inputs.
3. Add a test helper that supplies explicit default options and convert direct hook setup to override only the inputs each case needs.

## Tests

- `web/src/file-navigator/useFileNavigatorDrag.test.ts`: retain ordinary move, command-bar/editor/harness destination, remote path, conflict, and cleanup coverage through named options.
- Run `$janissary/scripts/run.mjs check-diff` after implementation.

## Specs and documentation

No functional spec, help, or public-documentation update is needed because the hook's internal call boundary is not user-visible.

## Out of scope

- Changing move, conflict, destination, or drag cleanup behavior.
