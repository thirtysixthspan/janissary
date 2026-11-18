# Subagent role lookup
**Complexity: 4/10** — ~25 added production lines, 1 existing file, 6 requirements, 15 scenarios (p=5.00)

## Goal

Add `knownRoleSettings(root, name, home)` returning undefined only when neither the roles file in effect nor `DEFAULT_ROLES` contains the trimmed, case-insensitive name. For a known name return exactly `readRoleSettings`'s entries, grants, and canonical name; share the existing lookup rather than recreating precedence.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 2 of 23.

## Decisions and dependencies

Dependencies: None; this unit is independently implementable against the current repository.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

`src/acp/ask-role.ts:22` (`findRole`) already matches trimmed, case-insensitive names; `readRoleSettings` at line 35 supplies canonical names, copied entries and copied grants. `src/plugins/roles/roles-file.ts:180` (`readRolesFile`) owns project-over-home selection, damaged-file fallback and `create:false`; reuse its decoded result rather than duplicating file discovery. `exhaustedError` at `src/acp/ask-role.ts:99` formats the failure list; its callers are `AcpManager.start` at `src/acp/manager.ts:54` and `finalAttemptResult` at `src/acp/ask-role.ts:109`.

## Planned file scope

Edit `src/acp/ask-role.ts`; extend `src/acp/ask-role.test.ts`; update `product/specs/roles.md` with the lookup contract.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Add `knownRoleSettings(root, name, home = homedir())` returning undefined only when neither the roles file in effect nor `DEFAULT_ROLES` contains the trimmed, case-insensitive name. A role appearing only in the overridden home file is unknown unless it also has a built-in default. Keep lookup, canonical spelling and settings construction in `ask-role.ts`; factor their shared settings construction into a private helper so each public reader performs one `readRolesFile` call and resolves existence and settings from that same result. Do not check existence and then call `readRoleSettings` for a second filesystem read.

2. Return exactly the existing `readRoleSettings` settings for known roles, including their canonical name and detached copies of entries and grants. A configured role with empty entries borrows that role's built-in entries while retaining its configured grants; a custom role without built-in entries remains known with zero entries. Unknown roles must still receive `readRoleSettings`'s existing empty-settings result from that older API, while the new API returns undefined. Preserve `askRoleSettings`, `askRoleEntries` and existing ask/tell callers without migrating them to the new optional result.

3. Read fresh for every call, project over home and built-in fallback, with `create:false`; use the existing damaged-file fallback too. The helper accepts its root argument and does not import Managers. Later command consumers pass `managers.tab.launchDir`, as `AcpManager.run` does at `src/acp/manager.ts:83`. Do not cache or write roles, merge an overridden home file, or consult descriptions. Return nonempty model lists verbatim even when unavailable; catalog filtering remains at callers, like `AcpManager.queueFor` at `src/acp/manager.ts:154`, and never causes this reader to substitute built-in entries.

4. Widen `exhaustedError`'s role parameter from `AcpRole` to string because it only appears in text, retaining its default `ask` value. Preserve failure order, harness/model labels and source error text, with the header `ACP: every model in the <role> role failed.`. Leave `Attempt.role`, `finalAttemptResult`'s role parameter and other role-session types as `AcpRole`; their ask/tell callers remain valid. The existing file has 115 raw lines, so this shared helper fits below the 200 counted-line limit without an extraction or new module.

## Tests

Extend the existing `directories` and `writeRoles` fixtures in `src/acp/ask-role.test.ts:18,28`. Cover a known custom role; trimmed/case-insensitive lookup retaining configured spelling; unknown or whitespace-only names; built-in fallback; no file creation with absent files; project replacement hiding a home-only custom role; an empty project object hiding home roles while built-ins remain known; a known custom role with zero entries; empty built-in entries preserving configured grants; nonempty unavailable entries preserved; damaged-project fallback to home; rereading changes on a later call; detached returned arrays/entries; custom-role exhausted errors preserving failure order/text; and unchanged default ask/tell failure formatting. Keep the existing reader tests, including saved grant preservation. No model catalog or command/launch API is needed for these tests.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Read an existing roles fixture using a mixed-case role name and confirm no roles file is created.

## Out of scope

No new default grants, model catalog filtering implementation, command or execution wiring, or role editor changes.
