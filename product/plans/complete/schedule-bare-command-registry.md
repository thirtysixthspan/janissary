# Fold the bare schedule command into its registry definition

**Complexity: 3/10** — the registry Command gains a bare-token branch, the pre-resolver branch and its shadow-list entry are deleted, and one test pins the bare form. One definition of `schedule`, reached behind the resolver.

The bare `schedule` token is intercepted in `CommandManager.run` before `resolveCommand` and opens the launch dialog there, while the registry `Command` in `src/commands/schedule.ts` handles every argful form — two definitions of one command, papered over by `ROUTE_NAMES` keeping plugin claims off the name.

## Goal

`schedule` is defined once, in the registry. An empty remainder — the bare token — opens the schedule launch dialog exactly as the `CommandManager.run` branch does today; the argful parsing is untouched. The pre-registry branch in `src/command/manager.ts` and the `schedule` entry in `src/plugins/command-adapter.ts`'s `ROUTE_NAMES` go away, leaving `shell` (stripped inside the resolver itself) as that list's only resident.

## Design decisions

**The bare branch is the empty remainder, not a special match:** `run` receives the full command and has the `Managers` registry, so `parseScheduleCommand('')` yields the dialog open when the argful parse is bypassed — a bare `schedule` calls `managers.schedule.openScheduleLaunch()` before the parse, exactly as the branch in `src/command/manager.ts` does today. `schedule <anything argful>` takes the existing parse path unchanged.

**`ROUTE_NAMES` loses `schedule`, not `shell`:** `shell` is consumed inside `resolveCommand` and has no registry entry, so the list is still the safety net for a name the resolver handles pre-emptively — prose-safe, exactly what the item names as the residual hazard for `schedule` alone.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The dialog-open call the branch performs | `managers.schedule.openScheduleLaunch()` |
| The registry command and its parse | `src/commands/schedule.ts` |
| The shadow-list mechanism | `ROUTE_NAMES` in `src/plugins/command-adapter.ts` |

## Implementation steps

1. **`src/commands/schedule.ts`**: in `run`, when the remainder is empty (`command_.trim().toLowerCase() === 'schedule'`), call `managers.schedule.openScheduleLaunch()` and return; the typed-command placement of the dialog is unchanged (no transcript line was appended before, and none is now).
2. **`src/command/manager.ts`**: delete the pre-registry branch.
3. **`src/plugins/command-adapter.ts`**: drop `schedule` from `ROUTE_NAMES`; the comment above it stops naming a branch that no longer exists.

## Tests

- **`src/commands.test.ts` or the command-manager tests** (new case) — a bare `schedule` opens the dialog with no transcript append, and `schedule a every 5m echo x` keeps parsing as before.
- **The plugin claim tests under `src/plugins/`** — unchanged: a plugin is *still* not refused for claiming `schedule` (the registry command refuses it instead, by name, through `coreCommands`).
- **`src/command/manager.test.ts`** — the deleted branch's pin (if any) retires with it.

## Spec

`product/specs/scheduling.md` and `product/specs/command-routing.md` cover the bare-token behavior — the dialog opens exactly as before, so the spec text stands; confirm nothing documents the branch position.

## Out of scope

- Removing `shell` from `ROUTE_NAMES` (it is still stripped pre-registry by design).
- The schedules tab / dialog plugins themselves.
