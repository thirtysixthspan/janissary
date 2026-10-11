# Use the Shared Atomic Writer for Config

Complexity: 4/10

## Goal

Use the shared atomic file writer for config creation and updates so existing file permissions are preserved consistently with other persistence paths.

## Approach

Replace the private temporary-file implementation in `src/config.ts` with `atomicWriteFile`. Keep the current JSON indentation and trailing newline, unknown-key merge, and assignment to the running config only after a successful write. Add permission-preservation coverage for the shared helper and config updates.

## Implementation steps

1. Remove the private config temp-file writer and its imports, and call `atomicWriteFile` with the same serialized content.
2. Add an existing-file mode preservation test to `src/atomic-write.test.ts`.
3. Add a config update test for a file restricted to mode `0600`.
4. Run `./scripts/run.mjs check-diff` and retain the atomic config behavior already described in `product/specs/application-config.md`.

## Tests

- Verify the shared writer preserves an existing mode.
- Verify config updates preserve mode `0600`.
- Keep coverage for serialization, unknown keys, failed writes, and temporary cleanup.
