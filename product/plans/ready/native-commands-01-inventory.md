# Native commands: canonical inventory

**Complexity: 5/10** — this creates a cross-cutting inventory contract from the ordered built-in/plugin registry, help fallback, and native ACP vocabulary, while leaving dispatch policy unchanged.

## Goal

Give the existing application command registry a complete, canonical inventory of commands and named fixed subcommand forms, ready for policy and presentation without changing routing or replies.

## Decisions and dependencies

- This is the first work unit of the native application-commands feature; it can build and pass its tests independently. The behavior spec to keep accurate is `product/specs/application-commands.md` (there is no `native-application-commands.md`). Do not change policy or user-visible behavior in this unit.
- Keep ordered `match` owner resolution in `resolveCommand` and `findCommand`. A plugin and built-in may share a name, as with `search`; only choose the longest fixed form within the selected owner's metadata. Preserve parser behavior and existing aliases.
- Declare forms and aliases explicitly on existing registry entries and accepted bundled-plugin metadata; do not infer forms from `samples`, which are registry-priority test inputs and may include arguments. Include `help` (currently handled outside the `Command` registry), every built-in command and alias, accepted bundled plugin claims/aliases, and the nine native ACP forms. Fixed forms end at the command/subcommand boundary: arguments such as filenames, patterns, and SQL are not inventory rows. Derive the inventory from accepted declarations, not every plugin manifest, because rejected claims do not enter dispatch.
- Normalize inventory lookup by trimming, collapsing whitespace, and case-folding. Canonicalize aliases to their owning canonical entry, represent fixed-form parent relationships explicitly, associate native ACP forms with their existing tool category, and return deterministic alphabetic rows. This is inventory normalization only; do not alter resolver matching or its case behavior. Put browser-shared inventory types in a new import-free shared contract module, not `src/protocol.ts`: this unit adds no wire payload, and the shared module must not import server code.

## Existing code to reuse

| Existing behavior | Source of truth to inspect and reuse |
| --- | --- |
| Ordered built-in registry and owner-sensitive lookup (`search` collision) | `src/commands/index.ts` (`commands`, `findCommand`) and `src/resolve.ts` (`resolveCommand`) |
| Command declaration fields and sample semantics | `src/commands/types.ts` (`Command.samples`) and `src/commands.test.ts` (priority assertions) |
| Help outside the command registry and fallback names | `src/commands.ts` (`availableCommands`, `getOutput`) |
| Plugin claims, aliases, rejection, and acceptance | `src/plugins/command-adapter.ts` (`createPluginCommands`) and `src/plugins/catalog.ts` (`tabPluginCatalog`); inspect each bundled manifest for its `command` and `commandAliases` |
| Native ACP vocabulary and tool association | `src/plugins/roles/shared.ts` (`NATIVE_ACP_COMMANDS`) and `src/acp/native-commands.ts` (`nativeCommandName`, `nativeCommandTool`) |
| Existing user-facing command behavior/spec | `product/specs/application-commands.md` |

Follow `ai/guidelines/architecture-principles.md` §5 (one command definition and execution path) and `ai/guidelines/imports-and-barrel-files.md` (direct imports, no new barrel). Keep new source files under the 200-code-line limit; `src/` relative imports use `.js` extensions. Shared contract modules are browser-imported and must remain import-free.

## Proposed changes

1. Add inventory metadata to the existing built-in declarations and the plugin adapter's accepted command declarations, retaining `match`, availability, registry order, and `samples` semantics. Metadata describes canonical names, explicit fixed forms, aliases, parent relationships, and optional native-tool association. Do not replace `findCommand`/`resolveCommand` or change dispatch precedence. Inventory resolution selects the already-resolved owner first, then its longest matching declared fixed form; unmatched trailing arguments do not invalidate a fixed-form match.
2. Include `help` as inventory data without adding a second executable command definition: its canonical name and supported fixed form(s) describe the existing `getOutput` path. Preserve bare/named help and unknown-input replies, and do not change help visibility or page behavior.
3. Expose pure functions to list inventory rows and resolve a normalized name/form, with alias lookup returning the canonical entry. Keep normalization and sorting deterministic. Update `product/specs/application-commands.md` only if the inventory's externally relied-on vocabulary or behavior is specified there; do not add speculative behavior to the spec. This unit creates no wire type or protocol change.

## Tests

Add colocated `src/**/*.test.ts` coverage for complete built-in, accepted-plugin, help, and native-ACP inventory; canonical spellings and aliases; whitespace/case normalization; fixed forms versus argument text; parent links; native-tool association; deterministic alphabetical ordering; and owner-first resolution of the built-in/plugin `search` collision. Assert rejected plugin claims are absent. Keep existing command priority, resolver, help, and plugin-adapter behavior tests passing unchanged; inventory tests must not redefine dispatch policy.

## Verification

Run `$janissary/scripts/run.mjs check-diff` during development and the targeted command registry, resolver, and plugin-adapter tests. Manually verify that bare `search` still selects the plugin claim, `search transcript <pattern>` still selects the built-in, and bare/named `help` plus an unknown command retain their current replies.

## Out of scope

Persistence, enforcement, ACP filtering, topic publication, and UI are later work units. Do not create or define custom commands.
