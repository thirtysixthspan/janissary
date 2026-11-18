# Derive the command inventory's built-in forms from the registry

**Complexity: 3/10** — ~32 added production lines, one edited file, six requirements including four parity guarantees (p=4.61)

Issue: the built-in command forms that feed the settings inventory are a hand-written table living next to the inventory builder, so a core command added without a matching row silently disappears from the settings list and cannot have its agent access revoked.

## Goal

`src/application-commands.ts` keeps `BUILTIN_FORMS`, a table keyed by command name that mirrors `coreCommands` in `src/commands/index.ts`. `buildApplicationCommands` walks the registry and skips any name missing from the table, so the two lists must be edited together with nothing checking that they were. A missed row is invisible in `listApplicationCommands`, absent from the command settings UI, and unrevokable through `disabledApplicationCommand`.

Move the table beside the registry it mirrors as `src/commands/forms.ts`, exporting it as `COMMAND_FORMS`, and add a parity test that fails when the registry and the table drift in either direction or when a declared form or parent no longer resolves. The emitted inventory must stay byte-for-byte identical.

## Approach

One data module, one consumer import, one parity guard. The table is pure declaration data and moves unchanged; `builtinRows`, `buildApplicationCommands`, and `resolveApplicationCommand` are not rewritten. The parity test walks both sides of the mirror: every core command except `shell` (owned by the shell plugin and asserted absent in `src/application-commands.test.ts`) must have a declaration, every declaration key must name a live core command, every declared form must resolve to a row that carries it, and every declared parent must name a real row. Adding a core command later then fails the build until its forms are declared, and deleting a command fails until its stale row is removed.

The test is written first and confirmed green against the current table, then the data moves and the test follows it to the new module. Because this change ships as one commit, those steps land together but keep that order.

## Implementation steps

1. Add `export` to `BUILTIN_FORMS` in `src/application-commands.ts` so the parity test can import the current table.
2. Add `src/application-commands.parity.test.ts` with the four parity assertions described in Tests, importing the table from `./application-commands.js`. Run the checks and confirm all four pass against the current data.
3. Create `src/commands/forms.ts` exporting `COMMAND_FORMS: Readonly<Record<string, ApplicationCommandDeclaration>>` with the exact keys, names, forms, aliases, and parents currently in `BUILTIN_FORMS`, importing the type from `../shared/application-commands.js`.
4. Point the parity test's table import at `./commands/forms.js`.
5. Remove `BUILTIN_FORMS` from `src/application-commands.ts`, import `COMMAND_FORMS` from `./commands/forms.js`, and have `buildApplicationCommands` look up `COMMAND_FORMS[command.name]`. Leave `builtinRows` and the rest of the file unchanged.
6. Run the checks again and confirm the inventory is unchanged.

## Tests

In `src/application-commands.parity.test.ts`:

- Every `coreCommands` entry except `shell` has a declaration key.
- Every declaration key names a live core command (no stale rows).
- Every form in every declaration resolves through `resolveApplicationCommand` to a row whose `forms` contains that form.
- Every declared `parent` names a command row in `listApplicationCommands`.

The existing `src/application-commands.test.ts` must keep passing unchanged, pinning that the emitted rows, normalization, and resolution behavior did not move.

## Out of scope

- The shape of `builtinRows`, `buildApplicationCommands`, or `resolveApplicationCommand`, all of which stay as they are.
- `src/native-commands/settings-file.ts`, `policy.ts`, and `state.ts`, which keep consuming `listApplicationCommands`.
- The `samples` shadow checks in `src/commands.test.ts`: samples describe dispatch, forms describe policy, and the two are not merged here.
- Any change to plugin or native ACP form rows.

## Specs and docs

- `product/specs/`: check for a spec covering the command settings inventory or the application-command list; extend it only if it states that the built-in forms are hand maintained or describes where they live. No user-visible command behavior changes, so no new spec section is expected.
- `help/` and `documentation/user-documentation/`: no command, flag, or key binding changes; nothing to update.
