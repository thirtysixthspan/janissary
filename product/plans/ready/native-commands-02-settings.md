# Native commands: settings service

**Complexity: 5/10** — file fallback, validation, atomic writes, and competing edits need focused coverage.

## Goal

Provide one host-owned service that reads, edits, and publishes effective command settings against the canonical inventory.

## Decisions and dependencies

- Depends on the inventory contract from `native-commands-01-inventory.md`: its canonical command names and native ACP-tool classification are the only source used to decode and evaluate settings. Keep the settings service separate from that inventory. Register it as the `nativeCommandSettings` manager in `src/managers.ts` (`ManagerRegistry`) and construct it in `src/controller/create-managers.ts` (`createManagers`); add it to `MANAGER_DISPOSE_ORDER` only if it owns disposable resources. Do not add another registry or per-tab settings maps. Later work units consume this manager.
- `~/.janissary/commands.json` is the home file; a valid project `.janissary/commands.json` replaces it entirely. Missing commands and missing `enabled` or `agentAccess` booleans default to true, including new commands and project overrides.
- The JSON object is keyed by command name. Normalize comparison keys by trimming, lowercasing, and collapsing each run of whitespace to one space; resolve collisions in textual file order so the last normalized occurrence supplies the setting value. Malformed individual entries default both booleans to true and mark the effective file unusable for edits; unknown keys are ignored for lookup and removed on the next successful save. Serialize only canonical names from the inventory. `agentAccess` has effect only for commands classified as native ACP tools by that inventory; for other commands its effective value is always true.
- Follow the Roles file fallback and damaged-file protections. An unusable project file falls back to home, then defaults. Match the reporting shapes in `src/plugins/roles/roles-file.ts` (`readRolesFile`): `commands.json <problem> at <path> — showing the <home|project> commands file.` or `commands.json <problem> at <path> — showing default commands.` Preserve damaged files and refuse edits when the effective file is unusable with `commands.json at <path> is unusable — fix the file before editing commands.` A damaged file skipped in favor of a usable file does not make that effective file read-only.
- Read at service initialization, on Commands tab opening, and before each edit, not continuously. Reads with no files return defaults without creating a file. When neither file exists, the first edit creates the home file; a valid project override is edited in place. On successful write, replace the applied snapshot and publish it to subscribers; on failure keep the previous snapshot and return `Could not write commands.json at <path>.`
- Use `atomicWriteFile` to avoid partial files. Do not serialize competing edits: each edit re-reads before applying, but overlapping edits may read the same file and the last full-file write wins, including lost updates. Each successful write publishes the exact settings it wrote. An in-flight invocation is not interrupted by a settings change.

## What already exists (reuse, don't rebuild)

| Existing code | Reuse |
| --- | --- |
| `src/plugins/roles/roles-file.ts:179` `readRolesFile` and `:218` `writeRolesFile` | Home/project fallback, damaged-file handling, and safe write behavior. Adapt the policy to commands rather than coupling the service to Roles. |
| `src/plugins/roles/ordered-json.ts:11` `orderedJsonKeys` and `:47` `serializeRoles` | Textual object-key order and stable serialization patterns; implement command-specific serialization rather than importing role types. |
| `src/plugins/files.ts:105` `readJsonConfigFile` and `:88` `writeJsonConfigFile` | Guarded JSON reads and atomic JSON writes. |
| `src/atomic-write.ts:8` `atomicWriteFile` | Temporary-file-and-rename replacement with existing permission preservation. |
| `src/managers.ts:38` `ManagerRegistry` and `:95` `MANAGER_DISPOSE_ORDER`; `src/controller/create-managers.ts:49` `createManagers` | Manager registration, construction, and lifecycle conventions. |
| Inventory from work unit 1 | Canonical names and native ACP-tool classification; do not recreate either list here. |

## Proposed changes

1. Add focused command-settings decode, read/fallback, and serialization modules under `src/native-commands/`; keep each source file within the 200 nonblank, noncomment line limit. Resolve normalized duplicates using the stated textual-order rule and leave malformed whole files intact.
2. Implement the `nativeCommandSettings` manager with an immutable current snapshot, saved values kept separate from effective values, refresh and awaited edit operations, and a subscribe/unsubscribe publication API. For a fixed-form child command, its effective global availability requires its own `enabled` value and every declared parent command's `enabled` value. Effective agent availability additionally requires `agentAccess` for the native ACP command and each native ACP parent; a non-native command has no agent-access restriction. Thus a child may retain a saved enabled value while being effectively unavailable under a disabled parent. Do not mutate settings during an already-running invocation.
3. Test file decoding and service operations directly before any tab or command consumes them. Update `product/specs/application-commands.md` and `product/specs/application-config.md` with the observable settings behavior and file format.

## Tests

Add colocated `src/native-commands/*.test.ts` tests following the server `src/**/*.test.ts` convention. Cover defaults, overrides, missing fields, normalization and textual-order duplicates, malformed entries and top-level files, unknown settings, precedence and exact fallback/refusal messages, preservation of broken files, no-write reads, first-write destination, failed atomic writes, re-read on edit, saved versus effective parent/agent availability, and competing writes with last full-file write winning and successful publications.

## Verification

Run `$janissary/scripts/run.mjs check-diff` during development and focused service/file tests using isolated home and project fixtures. Confirm no file is created merely by reading defaults and manually exercise a home setting plus a project override through the service read/edit path.

## Out of scope

Dispatch enforcement, UI, command-line edits, and ACP integration belong to later work units. Do not add per-role overrides or custom commands.
