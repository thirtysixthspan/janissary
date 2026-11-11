# ACP tool loop 9 — `ask` and `tell` grant `file read` by default

**Complexity: 2/10** — ~2 changed lines in 1 file, 4 requirements, 3 scenarios (p=3.76)

Run order: 9 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (decision 20; the third bullet of "Vocabulary and roles"). Depends on subplan 8 (`product/plans/complete/move-janissarys-acp-tool-loop-8-core-loop-snapshot.md`, landed), after which a granted `file read` actually runs in a core prompt. `file read` is already the last entry of `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` (subplan 6), so the roles tab already lists it as a grantable command; this subplan only changes what a new file starts with.

A newly created roles file should let `ask` and `tell` read files in the workspace without the user adding the grant by hand. This subplan adds that default. It lands only after subplan 8, so no default role advertises a tool the loop cannot run yet.

## Design decisions

- In `DEFAULT_ROLES` (`src/plugins/roles/roles-file.ts:27`, `export const DEFAULT_ROLES: readonly Role[]`), the `ask` role's `commands` list and the `tell` role's `commands` list each gain `'file read'` as their last element, directly after `'question approve'`. That matches `NATIVE_ACP_COMMANDS` order, where `file read` follows `question approve`. Append it to the existing last line of each list; no other entry moves.
- Only a newly created roles file gets it on disk. Existing roles files are never rewritten. `readRolesFile` writes the defaults only through `createDefaultFile(homePath)`, and only when neither the project nor the home `roles.json` exists (`candidates.length === 0`) and the caller did not pass `create: false`. Nothing in this subplan touches `readRolesFile`, `createDefaultFile`, or `writeRolesFile`, and no migration or "add missing default grant" pass is added anywhere.
- The other five default roles (`planning`, `research`, `code review`, `implementation`, `documentation`) keep `commands: []`.
- **In-memory defaults follow the same list, by design.** `DEFAULT_ROLES` is also what is served without writing a file, and those paths gain `file read` too, because they stand in for the file that would have been created:
  - `readRolesFile(..., { create: false })` with neither file present (`source: 'default'`), which is how `readRoleSettings` in `src/acp/ask-role.ts` reads roles for every ACP prompt;
  - the `source: 'default'` fallback when the file in effect cannot be decoded or created;
  - `readRoleSettings` when the roles file in effect has no `ask` or `tell` role at all (`const defaults = findRole(DEFAULT_ROLES, name)` and the `if (!configured)` branch).
  
  A file that does have an `ask` or `tell` role is used verbatim (`commands: [...configured.commands]`), so a role written before this subplan keeps exactly its stored grants and does not gain `file read`. Do not change `readRoleSettings`.
- `roles-file.ts` is at 188 effective lines (blank and comment lines skipped). Appending `'file read'` to the existing last line of each list adds no lines; wrapping it onto a new line adds at most two. Either way it stays under the 200 `max-lines` limit, and the repo has no `max-len` rule.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Default roles and first-run creation | `DEFAULT_ROLES`, `createDefaultFile`, `readRolesFile` in `src/plugins/roles/roles-file.ts` |
| Native command vocabulary, already ending in `file read` | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` |
| Per-prompt role grants with fallback to `DEFAULT_ROLES` | `readRoleSettings` in `src/acp/ask-role.ts` |
| Temp home/root fixtures and `homeFile`/`readJson`/`writeJson` helpers | top of `src/plugins/roles/roles-file.test.ts` |
| Temp roles fixture and `ASK_COMMANDS` constant | top of `src/acp/ask-role.test.ts` |

## Proposed changes

`src/plugins/roles/roles-file.ts`: the two default grants described above. No other production file changes.

## Tests

Existing tests pin the exact default grant lists and break when `file read` is added; update them in the same change so the suite stays green:

- `src/plugins/roles/roles-file.test.ts`, the case `'creates seven default roles with the exact ask and tell entries and grants'`: the expected `ask` `commands` and `tell` `commands` arrays each end with `'file read'`. Keep its existing `DEFAULT_ROLES.slice(0, 5).every((role) => role.commands.length === 0)` assertion, which already covers "no other role gets grants".
- `src/acp/ask-role.test.ts`: `ASK_COMMANDS` ends with `'file read'`, and the `'uses built-in entries and command grants when the requested role is absent'` case's `readRoleSettings(root, 'tell', home).commands` length goes from 9 to 10.

Add one new case to `src/plugins/roles/roles-file.test.ts`, in the `'reading the roles in effect'` describe block:

- an existing home roles file holding `ask` and `tell` roles whose `commands` lack `file read` is read back with those grants unchanged, and the file's text on disk is byte-identical after `readRolesFile(home, root)` (write it with `writeJson`, capture its text with `readFileSync`, read roles, compare the text). This pins "existing roles files are never rewritten".

The other `DEFAULT_ROLES` consumers need no change: `src/plugins/roles/activate.test.ts` compares against `DEFAULT_ROLES` itself, and `src/models/catalog-file.test.ts` only reads role entries.

## Out of scope

- `product/specs/roles.md` (it still lists the old `ask` grants and says `tell` "grants all nine native commands"); subplan 26 updates it. The spec stays stale between this subplan and 26.
- Adding `file read` to existing users' roles files, or to a stored `ask`/`tell` role that lacks it.
- Any change to the roles tab UI, the commands tab, or the gate.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then by hand, in a project with no `.janissary/roles.json` (a project file would replace the home file):

1. Move `~/.janissary/roles.json` aside.
2. Start janissary and open the roles tab, which creates the home file.
3. Confirm `~/.janissary/roles.json` lists `file read` last under `ask` and `tell`, the roles tab shows it granted for both, and the other five roles have no grants.
4. Restore the original file, reopen the roles tab, and confirm the restored file is unchanged and its `ask` and `tell` grants are as they were.
