# Default tell subagent grant
**Complexity: 2/10** — ~1 added production line, 1 existing file, 3 requirements, 10 scenarios, no new units (p=3.89)

## Goal

Grant subagent to the built-in tell role; leave every other built-in role's entries/grants unchanged. Existing saved roles files remain byte-for-byte unchanged and retain their listed grants.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 22 of 23.

## Decisions and dependencies

Dependencies: `product/plans/ready/subagent-21-native-command-integration.md`

Complete plan 21 and its earlier dependencies first, including plan 2's shared role-reader contract. The dependency provides the public command and vocabulary, but deliberately leaves tell's default grant and the count/documentation pins below to this unit. No new module, type, import or client code is needed here.

## What already exists (reuse, don't rebuild)

| Piece | Verified location and reuse |
| --- | --- |
| Explicit built-in defaults | `src/plugins/roles/roles-file.ts:27,75,82`, `DEFAULT_ROLES` and tell's `commands`, contain fourteen tell grants today. Append one literal grant to that list; do not derive it from the native vocabulary. |
| Default creation and read-only fallback | `src/plugins/roles/roles-file.ts:168,180,200`, `createDefaultFile` and `readRolesFile`, already create defaults only when neither file exists and creation is allowed. `create:false` returns in-memory defaults without writing. Damaged-file fallback also leaves files untouched. |
| Saved grants and role lookup | `src/plugins/roles/roles-file.ts:110,119`, `decodeRole`, turns a missing commands field into an empty list. `src/acp/ask-role.ts:35,38,47`, `readRoleSettings`, reads with `create:false`, substitutes built-in entries for an existing empty model list, and keeps that configured role's grants. An absent role instead gets built-in entries and grants. Plan 2's `knownRoleSettings` shares this contract. |
| Vocabulary ownership | `src/plugins/roles/shared.ts:3`, `NATIVE_ACP_COMMANDS`, has fourteen entries today. Plan 21 appends subagent and owns the registry, owner, tool table, inventory, picker tests and spec picker total. Its vocabulary change does not grant subagent to tell. |
| Existing regression fixtures | `src/plugins/roles/roles-file.test.ts:23,36,60,94,106`, `directories`, `writeJson`, the exact-default creation case, the no-create case and saved-grant byte comparison; `src/acp/ask-role.test.ts:18,28,86`, `directories`, `writeRoles` and the absent-role default-grant case. Extend these fixtures instead of introducing a migration or second reader. |

## Planned file scope

Edit only one production file, `src/plugins/roles/roles-file.ts`. Extend `src/plugins/roles/roles-file.test.ts` and `src/acp/ask-role.test.ts`. Update `help/tell.md`, `product/specs/roles.md`, `product/specs/acp.md` and `documentation/user-documentation/tab-types/roles.md`.

Only these seven files belong to this implementation unit. The reader implementation and plan 21's vocabulary/registration files remain read-only dependencies. Update the named specs, help and user documentation in the same checkpoint as the default grant and its test pins; plan 23 does not own this unit's missing documentation.

## Implementation steps

1. Append `subagent` exactly once at the end of built-in tell's explicit commands list in `DEFAULT_ROLES`. Preserve its existing grant order, model entries and description, every other role's fields and grants, and the seven-role order. Change no model or effort defaults. The canonical Vocabulary and grants clause at `product/plans/complete/subagent.md:77` authorizes this default only; it does not authorize migration or granting every published command. The production file currently has 189 counted lines, so the one added line fits at about 190 without extraction, compaction or removing spacing/comments.

2. Retain all existing read/create behavior without editing a reader or serializer. With no files, opening Roles may create the default home file containing the new grant; ACP role readers use `create:false` and return the new defaults in memory without creating either file. A saved home or project tell role retains exactly its listed commands, including an empty or missing list, even when its empty model entries use built-in entries. No saved bytes change. If the effective file has no tell role, role lookup uses built-in tell grants, including subagent, without inserting a role into that file. A valid empty project object still replaces the home file wholesale for `readRolesFile`; role lookup's built-in fallback is a separate existing behavior. Preserve damaged-file fallback and project-over-home precedence. Plan 2 owns the common `readRoleSettings`/`knownRoleSettings` implementation; this unit only verifies that its new default flows through it.

3. Update every default-grant pin in this checkpoint: the explicit tell commands list and `file['tell'].commands` length in `src/plugins/roles/roles-file.test.ts:80,90`, the `create:false` tell length at line 102, and `tell` returned by `readRoleSettings` in `src/acp/ask-role.test.ts:95,96`. Add subagent membership and exact-list assertions where appropriate; do not replace an independent expected list with a value copied from the same `DEFAULT_ROLES` under test. The current tell count is fourteen and becomes fifteen after this unit, while plan 21 has already raised the vocabulary from fourteen to fifteen. At implementation time re-read both explicit lists and preserve any file-patch/web-search changes that have landed. Each independently adds vocabulary; neither is a dependency here. Increase the tell count only by this unit's one grant, and use the actual published vocabulary size for picker prose. Never increment an already-updated picker total again or grant an unrelated command merely to make counts match.

4. Update `help/tell.md:26`, the note beginning `The models and commands come from`, and `product/specs/roles.md:58,59`, the built-in tell grants paragraph, with subagent and the actual default grant count. Update the separate `product/specs/acp.md:137` clause beginning `file read is granted by default` so it no longer says tell grants fourteen. Keep ask's grants/count unchanged except for independent changes already present. Preserve the absent-role fallback, existing empty/missing commands and saved-file guarantees. Plan 21 owns the vocabulary/picker change at `product/specs/roles.md:95`; verify its total remains the actual vocabulary size. Do not assume the vocabulary size and a role's grant count always match or say `all` unless the actual sets match.

5. Update the user Roles page's defaults and tell capability paragraphs at `documentation/user-documentation/tab-types/roles.md:17,29`, and its **Add command** total at line 27 against the actual vocabulary. Correct the saved-choice wording at lines 15 and 95: subagent consumes a named role's ordered model choices and native grants; selecting, editing or reordering a card still launches no harness. Tell receives the launch command through its built-in default, while saved tell roles need an explicit subagent grant. Explain that research, code review, implementation and documentation need enabled model entries before use; their defaults remain empty and descriptions are never execution instructions. Link to plan 21's existing subagent reference at `/user-documentation/command-reference/subagent`, following `documentation/.vitepress/command-reference.ts:36`, `commandReferenceSidebar`. Keep user-facing prose about commands and observable behavior, without source paths or helper names. Do not add a new public page or promise nested launches, per-launch model flags or broader default tools.

## Tests

Use the existing colocated server suites and filesystem fixtures. Retain earlier reader/precedence tests rather than duplicating plan 2's full matrix. The ten scenarios below count distinct configurations and fallback paths once; checking both role-reader APIs in a case does not add another scenario.

| Group | Required scenarios |
| --- | --- |
| Built-in defaults (3) | Newly created home defaults serialize subagent exactly once as tell's final grant, with the previous explicit tell list as its prefix and all other role/model/grant defaults unchanged (1). With neither file present, `create:false` returns the new default grant without creating a home or project file or writing/renaming anything (1). The existing all-files-damaged fallback returns the new default while preserving damaged bytes and existing diagnostics (1). |
| Saved tell grants (3) | A saved home tell omitting subagent retains its exact grant list and bytes (1). A saved project tell omitting it overrides a home tell that grants it, with both files unchanged (1). A saved tell already granting subagent preserves its list, including order, duplicate grants and unknown strings, without a rewrite (1). Reuse the existing write/rename spies after fixture setup; do not count fixture writes as reader writes. |
| Role readers (4) | Extend the existing absent-tell case at `src/acp/ask-role.test.ts:86` to return the explicit new default grant list while preserving the file's bytes (1). An existing tell with empty model entries and an empty commands list borrows default models but receives no tools (1); the same configuration with the commands field absent also receives no tools (1). A valid empty project object hides a home tell: raw roles remain empty, but role lookup returns built-in tell entries and the new grants without modifying either file (1). In these cases assert `readRoleSettings` and plan 2's `knownRoleSettings` agree for the known built-in tell role; reuse its shared reader tests without adding a second implementation. |

These pin three production requirements: exactly one new default tell grant, preservation of all other defaults, and unchanged saved-file/read/create/fallback behavior. Add no registry, tool-loop, launch, nesting or UI integration tests here; plan 21 and the earlier execution units already own those behaviors.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: In an isolated fixture with neither roles file, read tell settings and confirm subagent is available without a file being created; open Roles and confirm a newly created home file includes it only on tell. Compare with a saved tell omitting subagent: opening/reading keeps its listed grants and exact file bytes. Confirm the help, Roles page and both spec clauses describe these two cases and use actual grant/vocabulary totals. With plan 21's command available, a fixture tell tool table from default settings includes its subagent entry, while a saved tell list omitting it does not; reuse its existing grant-filter fixture without launching a real provider. Full launch/delivery/reset/remote reconciliation remains plan 23.

## Out of scope

No native vocabulary/registry/owner/table changes, reader/serializer redesign, new roles or model/effort defaults, blanket default grants, saved-file migration or rewrite, launch/delivery behavior, nested execution, protocol/version changes, new UI/page or role list in a primer. Only the chosen plan is edited during this improvement pass.
