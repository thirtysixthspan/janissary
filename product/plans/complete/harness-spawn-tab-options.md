# Harness spawnTab options object

Complexity: 3/10

## Goal

Remove the argument-order hazard in `HarnessManager.spawnTab`: a 12-argument positional list repeated at two call sites (`open()` and `openFromProfile()`), where adjacent parameters share a type (`offline`/`autoApprove` both `boolean`, `model`/`effort` both `string | undefined`) so a transposition would compile silently.

## Approach

Introduce a `SpawnTabOptions` object type and pass one object instead of a positional list. Both call sites then name every field, so a swapped pair is a type error or an obviously wrong key rather than silent breakage. `spawnTab` forwards the same object to `finishSpawn` — its 8-argument positional list is the same hazard, invoked twice inside `spawnTab` (once directly, once from the deferred provisioning callback), and it consumes a subset of the same fields.

`src/harness/manager.ts` sits at 194 code lines against the 200-line `max-lines` limit, so the type declaration goes in a new module rather than inline.

## Implementation steps

1. Add `src/harness/spawn-options.ts` exporting the `SpawnTabOptions` interface (`name`, `label`, `cwd`, `workspaceDir?`, `offline`, `group`, `groupColor`, `dotColor`, `autoApprove`, `model?`, `effort?`, `ready?`).
2. Change `spawnTab` and `finishSpawn` in `src/harness/manager.ts` to take a single `SpawnTabOptions`, and update the two call sites in `open()` and `openFromProfile()` to build the object.
3. Run `./scripts/run.mjs check-diff` and fix anything it reports.

## Tests

Behavior is unchanged, so the existing `manager.test.ts` suite is the regression gate. Add tests to it that pin the fields most at risk of a transposition, asserting each lands where it belongs rather than on its neighbor:

- A `run()` launch with `--offline` but no `-y`, and with `-y` but no `--offline`, each landing on the correct tab flag.
- A `run()` launch with `--model` and `--effort` both set, asserting the values are not swapped on the harness payload.
- An `openFromProfile()` launch asserting `group`/`groupColor`/`dotColor` land on the correct tab fields.

## Out of scope

Do not change the `open()` or `openFromProfile()` signatures, launch behavior, provisioning flow, or anything a user can observe.
