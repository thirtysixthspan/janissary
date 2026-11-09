<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share the commands domain source and native-tool sets between the payload validator and the shared contract instead of duplicating them.

Existing Issue: `src/plugins/commands/payload.ts` redefines the `SOURCES` and `NATIVE_TOOLS` sets and the `isRecord` guard that already exist in `src/plugins/commands/shared.ts`, so the two validators can drift when the domain changes. Severity: 2/10

Existing Risk: 2/10 - Adding a source or native tool to one module but not the other can make the topic validator reject a valid snapshot or accept an invalid one while the client guard disagrees.

Proposal Risk: 1/10 - Exporting the existing sets and helper from the import-free shared contract and importing them in the payload validator keeps one definition; the client chunk already carries them.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "share the commands domain sets between the payload validator and the shared contract". In `src/plugins/commands/shared.ts`, export the existing `SOURCES`, `NATIVE_TOOLS`, and `isRecord` without adding imports so the contract stays import-free; in `src/plugins/commands/payload.ts`, import those values from `./shared.js` instead of redefining them, leaving the payload-specific `KINDS`, `isStringList`, and shape checks local. Keep `isCommandsPayload`, `isSetIntent`, `isCommandsData`, and `toPayload` behavior unchanged, and run the existing shared and activate tests; add a payload test only if the sharing changes a branch.
