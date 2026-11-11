# ACP tool loop 9 — `ask` and `tell` grant `file read` by default

**Complexity: 2/10** — ~2 added lines in 1 file, 3 requirements, 2 scenarios (p=3.50)

Run order: 9 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 20; the third bullet of "Vocabulary and roles"). Depends on subplan 8 (`move-janissarys-acp-tool-loop-8-core-loop-snapshot.md`), after which a granted `file read` actually runs.

A newly created roles file should let `ask` and `tell` read files in the workspace without the user adding the grant by hand. This subplan adds that default. It lands only after subplan 8, so no default role advertises a tool the loop cannot run yet.

## Design decisions

- In `DEFAULT_ROLES` (`src/plugins/roles/roles-file.ts`), the `ask` and `tell` roles gain `file read` after `question approve`, matching vocabulary order.
- Only a newly created roles file gets it. Existing roles files are never rewritten. `readRolesFile` writes the defaults only when no file exists (`createDefaultFile`), and nothing in this subplan changes that.
- The other default roles keep no grants.
- `roles-file.ts` is at 188 effective lines. Two string entries keep it under 200.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Default roles and first-run creation | `DEFAULT_ROLES`, `createDefaultFile`, `readRolesFile` in `src/plugins/roles/roles-file.ts` |

## Proposed changes

`src/plugins/roles/roles-file.ts`: the two default grants.

## Tests

The roles-file tests:
- a freshly created roles file grants `file read` to `ask` and `tell`, and to no other role;
- an existing roles file without `file read` is read back unchanged and not rewritten.

## Out of scope

The roles spec (subplan 26).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then, by hand, move your home roles file aside, start janissary, and confirm the roles tab shows `file read` under `ask` and `tell`. Restore the original file afterwards.
