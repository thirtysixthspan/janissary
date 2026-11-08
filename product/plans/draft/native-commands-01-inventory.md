# Native commands: canonical inventory

**Complexity: 5/10** — describing the existing command vocabulary requires checking the parsers, aliases, and ordered plugin claims, but does not change command policy.

## Goal

Give the existing application command registry a complete, canonical inventory of commands and named fixed subcommand forms, ready for policy and presentation without changing routing or replies.

## Decisions and dependencies

- This is the first work unit of `native-application-commands.md`; no later work is required for it to build and pass its tests.
- Keep ordered `match` owner resolution in `resolveCommand` and `findCommand`. A plugin and built-in may share a name, as with `search`; only choose the longest fixed form within the selected owner's metadata. Preserve parser behavior and existing aliases.
- Declare forms and aliases explicitly on the existing registry entries and accepted bundled plugin adapters; do not infer them from `samples`, which remain priority-test inputs and may contain arguments. Include `help`, all built-ins, the nine existing native ACP commands, and bundled plugin commands. Arguments such as filenames and SQL are not rows.
- Normalize policy lookup case-insensitively after trimming and collapsing whitespace. Canonicalize aliases to one key, identify parent relationships and native ACP eligibility, and provide deterministic alphabetic rows. Share browser-needed types in an import-free contract; keep wire types in `src/protocol.ts` when introduced later.

## Existing code to reuse

`src/commands/index.ts`, `src/commands/types.ts`, `src/resolve.ts`, `src/commands.ts`, `src/plugins/command-adapter.ts`, `src/plugins/catalog.ts`, `src/plugins/roles/shared.ts`, and `src/acp/native-commands.ts` are the existing registry, routing, plugin acceptance, and native vocabulary. Inspect individual command parsers and manifests for actual fixed forms and aliases.

## Proposed changes

1. Extend command declarations and accepted plugin adapter metadata with canonical names, fixed forms, aliases, parents, and native-tool association while retaining existing `match`, availability, order, and sample semantics. Resolve aliases and longest matching form only after owner resolution.
2. Represent `help` in or through the same inventory and execution seam so a later policy check can claim it, while preserving the replies from `getOutput` for bare and named help and unknown input. Avoid a second registry or changes to help visibility.
3. Expose pure inventory and resolution functions for later service and consumer work. Update relevant command and plugin contract specs only to describe behavior actually present at this stage.

## Tests

Add colocated tests for complete inventory coverage, canonical spelling, normalization, fixed forms versus arguments, aliases, parent links, native-tool membership, longest form within an owner, and the competing built-in/plugin `search` owners. Preserve registry priority, help, and existing routing tests.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and targeted command, resolver, and plugin adapter tests. Confirm command replies and routing are unchanged.

## Out of scope

Persistence, enforcement, ACP filtering, topic publication, and UI are later work units. Do not create or define custom commands.
