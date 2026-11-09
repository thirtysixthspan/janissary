# Derive plugin inventory rows from accepted plugin claims

**Complexity: 3/10** — a small refactor of the command adapter to keep each accepted claim with its declaration, one consumer change in the inventory, and one new test file. No behavior changes for the bundled catalog, which claims no reserved names today.

`listApplicationCommands` decides a bundled plugin declaration was accepted by checking the union of every registered command name. A declaration whose command or alias claims a reserved core name such as `open` is refused by `createPluginCommands`, yet the core command keeps that name in the union, so a phantom plugin row or alias still appears.

## Goal

Plugin rows and aliases in the inventory come only from claims the adapter accepted. A rejected command or alias contributes nothing, even when its text matches a core command. Row shape, aliases, and alphabetical ordering are unchanged.

## Approach

1. `src/plugins/command-adapter.ts`: add `claimPluginCommands`, returning one `{ declarationId, name, command }` per accepted claim. `createPluginCommands` becomes a map over it, so its behavior and rejection recording are identical.
2. `src/commands/index.ts`: build `pluginCommandClaims` once with `claimPluginCommands`, export it, and derive the plugin part of `commands` from it.
3. `src/application-commands.ts`: build each plugin row from that declaration's accepted names only: the row requires its command to be accepted, and its aliases are filtered to accepted names. The union of registered names is no longer used.

## Tests

New `src/application-commands.claims.test.ts` (separate file so `vi.mock('./plugins/catalog.js')` does not disturb the existing module-level rows), clearing the contribution-rejection registry in `afterEach`:

- A declaration claiming `open` contributes no plugin row and no alias, and the builtin `open` row remains.
- An accepted declaration keeps its row and aliases while its rejected alias `open` is dropped.
- Every core command has an inventory row (the builtin `shell` represented by the plugin row), there is exactly one `help` row, and each of the nine native ACP commands has exactly one row.

## Specs

`product/specs/application-commands.md`: state that the inventory lists only accepted plugin claims.

## Out of scope

Removing `hasHelpFallback`, the Agent access checkbox parent rule, and the pull request title are separate backlog entries.
