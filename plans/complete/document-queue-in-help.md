# Document the `queue` command and Ctrl+E in help.md

**Complexity: 1/10** — purely additive content fix; no runtime logic changes.

## Goal

`help.md` (served verbatim by the `help` command, see `src/commands.ts`'s `buildHelp`) lists every
built-in command and key binding except `queue` and its `Ctrl+E` trigger. Add both, matching the
existing table styles.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Command/key-binding tables to extend | `help.md` |
| `help` command's read-and-cache of the file | `src/commands.ts` (`buildHelp`, `getOutput`) |
| Source of truth for `queue`'s behavior | `src/commands/queue.ts` |
| Source of truth for the Ctrl+E binding | `web/src/useWindowKeys.ts:98` (chord comment at `:87` already lists it as "Ctrl+E queue") |

## Changes

1. **`help.md`** — add a `queue` row to the Commands table (after `send`, matching adjacent rows'
   phrasing): describes both the targeted form (`queue <agent> <command>`) and that bare `queue`
   opens the interactive picker. Add a `Ctrl+E` row to the Key Bindings table (after `Ctrl+R`,
   the other picker-opening binding).
2. **`src/commands.test.ts` (new)** — no test file previously existed for `src/commands.ts`'s
   `getOutput`/`buildHelp`. Added two small assertions that `getOutput('help')` contains the new
   `queue` command mention and the `Ctrl+E` key binding, so a future edit to `help.md` that drops
   either is caught.

## Out of scope

- Other pre-existing gaps in `help.md` (e.g. `Cmd+F`, `Ctrl+G`, `Cmd+T` also aren't in the Key
  Bindings table) — not part of this issue, which is scoped to `queue` specifically.
- `src/commands.ts`'s `availableCommands` fallback list, which is already missing several commands
  beyond `queue` (used only when `help.md` fails to read) — a separate, pre-existing gap.

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the new/related server test.
- Manual (not run in this environment): type `help` in the app and confirm the rendered table shows
  the new `queue` row and `Ctrl+E` binding.
