# Native commands: settings service

**Complexity: 5/10** — file fallback, validation, atomic writes, and competing edits need focused coverage.

## Goal

Provide one host-owned service that reads, edits, and publishes effective command settings against the canonical inventory.

## Decisions and dependencies

- Depends on `native-commands-01-inventory.md`. Register lifecycle with `Managers`; do not add a second registry or per-tab settings maps. Consumers will use the service in later work units.
- `~/.janissary/commands.json` is the home file; a valid project `.janissary/commands.json` replaces it entirely. Missing commands and missing `enabled` or `agentAccess` booleans default to true, including new commands and project overrides.
- A JSON object is keyed by canonical command name. Normalize case, surrounding whitespace, and repeated spaces; use the last normalized duplicate. Malformed individual entries use enabled defaults and can be removed on save; unknown keys are removed on save. Save canonical names. Agent access is meaningful only for existing native ACP tools.
- Follow Roles fallback and damaged-file protections: an unusable project file falls back to home, then defaults; report `commands.json <problem> at <path> — showing the <home|project> commands file.` or `commands.json <problem> at <path> — showing default commands.` Preserve damaged files and refuse edits to an unusable effective file with `commands.json at <path> is unusable — fix the file before editing commands.` Distinguish skipped damaged files from the effective file as Roles does.
- Read at service initialization, on Commands tab opening, and before each edit, not continuously. When neither file exists, the first edit creates the home file; a valid project override is edited in place. A successful write applies and publishes its resulting snapshot; a failed write preserves the last applied state and returns `Could not write commands.json at <path>.`
- Use `atomicWriteFile` to avoid partial files. Concurrent edits may read the same file and last full-file write wins, including lost updates; each successful write publishes the settings it wrote. Do not add serialization.

## Existing code to reuse

`src/plugins/roles/roles-file.ts`, `src/plugins/roles/ordered-json.ts`, `src/plugins/files.ts`, `src/atomic-write.ts`, `src/managers.ts`, and the inventory from work unit 1 provide existing file, normalization, atomic write, and lifecycle precedents.

## Proposed changes

1. Add focused decoding, read/fallback, canonical serialization, and atomic writing modules. Handle duplicate normalized keys in actual file order and leave malformed whole files intact.
2. Implement the service with immutable current snapshot, parent-aware effective global and agent availability, saved values separate from effective values, refresh and awaited edit operations, and change publication for future subscribers. An already-running invocation is not interrupted by changes.
3. Test service operations directly before any tab or command consumes them. Document the file and settings behavior in the appropriate application-command/configuration specs.

## Tests

Cover defaults, overrides, missing fields, normalization, duplicates, malformed entries and top-level files, unknown settings, precedence and exact fallback/refusal messages, preservation of broken files, first-write destination, failed atomic writes, re-read on edit, separate saved and effective parent/child values, and competing writes with last full-file write winning and successful publications.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused service/file tests using isolated home and project fixtures. Confirm no file is created merely by reading defaults.

## Out of scope

Dispatch enforcement, UI, command-line edits, and ACP integration belong to later work units. Do not add per-role overrides or custom commands.
