# Implement the hosts catalog command operations

**Complexity: 5/10** — ~108 added production lines, 8 requirements and 23 scenarios (p=5.357)

## Goal

Give the plugin a reusable server handler for `hosts list`, `hosts add`, and `hosts remove`. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-2-effective-file.md`.

## Implementation

Create `src/plugins/hosts/catalog-commands.ts` with a pure `parseCatalogCommand(argument)` and a synchronous `runCatalogCommand(argument, root, home, notify)`. `runPluginCommand` in `src/plugins/sibling.ts:10` already removes the command word and its separating whitespace. Split the remaining text on whitespace and match the verb case-insensitively. An empty tail returns an open outcome. `list` accepts no operands. An unknown verb or invalid `list` arity returns `Usage: hosts [list|add|remove].`

`add` accepts `name`, a destination token and an optional `path`. A destination token may have one `@` separating a nonempty user from the host-and-port portion. Return `Usage: hosts add <name> <[user@]host[:port]> [path]` for wrong arity, a bare `@`, multiple `@` separators or an empty explicit user. For a token with a user followed by an empty host, pass the empty destination to the shared field validator so it supplies the destination diagnostic. Use that validator for the name and the remaining user, destination, port and path fields. `remove` accepts one name, returning `Usage: hosts remove <name>` when arity is wrong. Use the shared name predicate and its exact field message for invalid names. Parsing and field validation precede catalog I/O.

Pass `root`, `home` and the notification callback into the shared storage operations from the prerequisite plan. `list` reads once and returns `serializeHosts` output as plain text, including `{}` for empty and unusable effective files. Run `add` and `remove` through the synchronous storage mutation entry point. Inside its fresh read, select with the shared case-insensitive comparison. An add with no match returns `Host <name> added.`; a match replaces only that entry under the newly supplied spelling and returns `Host <name> updated.` A successful remove returns `Host <name> removed.` with the stored spelling. A miss returns `No host named "<name>".` with the requested spelling and leaves the file alone. Propagate the shared storage failures without rewording. Include the written catalog and path only after a successful mutation so activation can update an open Hosts tab directly.

Keep open, output, refusal and successful mutation as distinct outcomes. At the later activation boundary, follow `src/plugins/roles/activate.ts:144` (`command`) for an ordinary `rejectRequest` and `src/plugins/context.ts:117` (`note`) for successful output. `runGuarded` at `src/plugins/host.ts:136` writes a refusal via `noteInOriginTab`. Both transcript paths use plain output, which preserves the literal angle brackets in usage and the JSON's indentation. Keep the handler independent of those capabilities.

## Tests and verification

Add `src/plugins/hosts/catalog-commands.test.ts` for empty input, exact two-space list output, empty and unusable lists, unknown verbs, malformed list/add/remove arity, a minimal and full add, case-folded replacement, empty and multiple user separators, each invalid field diagnostic, a successful remove, a remove miss, unusable-file refusal, write failure, and a hand edit preserved by a subsequent mutation. Assert verb matching ignores case, malformed requests skip storage, and successful writes alone return the new catalog and path. Run `$janissary/scripts/run.mjs check-diff`. Exercise the handler in a scratch catalog by adding `Lab` with `ops@lab.local:2222` and `~/work`, listing the exact JSON, replacing it with `lab`, then removing it as `LAB` and confirming the list returns `{}`.

## Out of scope

The production command registration, tab open/refresh and modal-specific collision rules.
