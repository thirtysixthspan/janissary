# Accept any roles-file role across the core ACP pipeline and generic close

**Complexity: 4/10** — ~45 added lines across 9 files, 3 requirements and 6 role-enumeration/close scenarios (p=5.09)

## Goal

The core pipeline is hard-coded to two role names, `ask` and `tell`, so a persona naming a custom role from the roles file cannot use it. This subplan widens the core role key and every place that enumerates, prefixes, stores or routes by role, and extends `connections close acp:<role>:<model>` to resolve any role name. It is additive: `ask` and `tell` keep working unchanged, and no consumer is left referencing a removed symbol.

This subplan decomposes `./product/plans/complete/ai-personas.md` and depends on `./product/plans/ready/ai-personas-1-role-directive-format.md` and `./product/plans/ready/ai-personas-2-role-resolution-and-validation.md`.

## Requirements

1. "Widen core to custom role names" — the core pipeline accepts any role name from the roles file, not just `ask` and `tell`, including prompt-prefix handling and role-state typing.
2. "Extend generic close to any role" — `connections close acp:<role>:<model>` resolves any role name from the roles file instead of falling back to `ask`; the `acp:<role>:<provider/model>` row form is unchanged and no reset command is added.
3. Core role tests cover a custom role name from the roles file, including its connection row and `connections close acp:<role>:<model>` resolution.

## Design decisions

- `AcpRole` becomes the open string type in `src/acp/role.ts`; `ACP_ROLES` stays as the built-in default set and `DEFAULT_ACP_ROLE` stays `ask`, so existing callers with no explicit role keep their behaviour (linked to Assumption 1).
- Prompt-prefix handling is derived from the role name rather than a two-way ternary: a leading `<role>` word is stripped when present, and a missing prompt still reports `Usage: <role> <prompt>.`. The check is a case-insensitive string prefix plus a word boundary, not an interpolated `RegExp`, so a role name from a user-edited roles file cannot become a regular expression and trip `security/detect-unsafe-regex` (linked to Assumption 2 and Assumption 6).
- The role enumeration in `src/connection/catalog.ts` is widened from the fixed `ACP_ROLES` to the names from the roles file in effect (project over home, read without creating a file), so a custom role's open session produces the same `acp:<role>:<provider/model>` row as `ask` and `tell` (linked to Assumption 3).
- The two plugin-side mirror contracts (`src/plugins/connections/shared.ts` and `src/plugins/shell/shared.ts`) must accept the same open role string, because they cannot import the core type; their hand-written role guards widen from `=== 'ask' || === 'tell'` to any non-empty role name (linked to Assumption 4). Their payload schema versions stay unchanged because the field shape does not change.
- `coreAcpTarget` in `src/connection/close.ts` parses the id's first `:`-delimited segment as a role name only when that name resolves through the roles file; otherwise it keeps today's fallback of `ask` with the whole id as suffix, so legacy ids still close. No new command is introduced.
- Everything in this subplan is additive at the type level: widening `AcpRole` to `string` keeps every current `'ask' | 'tell'` literal assignable, so no production consumer is deferred to a later subplan.

## Preserved behavior

None found. The four web query-line and pill behaviors are owned by subplan 4 and are not touched here.

## Assumptions

1. `ACP_ROLES` is currently `['ask', 'tell'] as const` and `AcpRole` is derived from it — `src/acp/role.ts:1` (`export const ACP_ROLES = ['ask', 'tell'] as const;`) and `src/acp/role.ts:3`.
2. `AcpManager.prompt` and `AcpManager.run` currently choose the prefix with a two-way ternary — `src/acp/manager.ts:61` (`const prefix = role === 'ask' ? /^ask\b/i : /^tell\b/i;`) and `src/acp/manager.ts:89`.
3. `acpEntries` enumerates only `ACP_ROLES` when building connection rows — `src/connection/catalog.ts:30` (`for (const role of ACP_ROLES) {`).
4. The connections plugin's role guard accepts only two literal names — `src/plugins/connections/shared.ts:82` (`return value === 'ask' || value === 'tell';`); the shell plugin repeats this in `isAcpRef` and `isShellAcpReceipt` — `src/plugins/shell/shared.ts:146` and `src/plugins/shell/shared.ts:238`.
5. `coreAcpTarget` hard-codes the two built-in names and defaults everything else to `ask` — `src/connection/close.ts:15-21` (`function coreAcpTarget(id: string)`).
6. `readRolesFile` is the project-over-home reader that does not create a file — `src/plugins/roles/roles-file.ts` (`export function readRolesFile`), used the same way by `knownRoleSettings` at `src/acp/ask-role.ts:70`. Role names are user-authored free text, so a prefix test must not interpolate them into a regex.
7. ACP record validation currently checks stored roles against `ACP_ROLES` — `src/acp-records/validation.ts:7` (`const validAcpRoles: readonly string[] = ACP_ROLES;`).

## Existing functionality

1. `readRoleSettings` resolves any named role's entries and commands — `src/acp/ask-role.ts:61` (`export function readRoleSettings`).
2. `readRolesFile` supplies the roles-file names in effect — `src/plugins/roles/roles-file.ts` (`readRolesFile`).
3. `AcpManager.promptResult` / `AcpManager.run` are the generic prompt entry points already parameterised by role — `src/acp/manager.ts:67` and `src/acp/manager.ts:74`.
4. `acpRoleRuntime` indexes role state by a role key — `src/acp/role-state.ts:15` (`export function acpRoleRuntime`).
5. `managers.acp.close` closes a session by label and role — `src/connection/close.ts:36` (`managers.acp.close(label, undefined, target.role)`).
6. `attemptOrder`, `fallbackNotice` and `exhaustedError` already implement ordered model attempts and fallback notices — `src/acp/ask-role.ts:92`, `:101`, `:120`; the widened core pipeline keeps reusing them unchanged, so no fallback mechanism is rebuilt here.

## Implementation steps

1. In `src/acp/role.ts`, change `AcpRole` to `string` while leaving `ACP_ROLES` as the literal built-in list and `DEFAULT_ACP_ROLE = 'ask'`. Confirm no other module declares a competing `AcpRole` that production code imports from; the two plugin mirrors are handled in step 4. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/acp/manager.ts`, replace both two-way prefix ternaries with one small pure helper in the same module: lowercase the command and the role, accept a prefix only when the command starts with the role followed by whitespace or end-of-string, and return the command with that many leading characters removed. Keep the existing refusal/no-models/usage branches. Do not use `new RegExp` with an interpolated role name. Do not change the shape of `promptResult` or `run`. In `src/acp/role-state.ts` and `src/tab/types.ts`, keep the existing `Partial<Record<AcpRole, …>>` typing, which now admits custom names without a structural change. The additions are a few lines and keep `src/acp/manager.ts` within the 200-line `max-lines` limit (blanks and comments skipped), so no extraction is needed. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/connection/catalog.ts`, replace `for (const role of ACP_ROLES)` with a de-duplicated enumeration built from `readRolesFile(homedir(), managers.tab.launchDir, { create: false }).roles.map((role) => role.name)` and the built-in `ACP_ROLES`, importing `readRolesFile` from `../plugins/roles/roles-file.js` and `homedir` from `node:os`. Keep each row's `id` as `<role>:<model>` and `display` as `acp:<role>:<provider/model>`, and keep `acpRef: { scope: 'tab', label, role }`. Also widen `src/acp-records/validation.ts`: drop the `ACP_ROLES` membership test and accept any non-empty string as `source.role` for `kind: 'acp'` records, because a persisted custom-role record must survive reload without the validator having to read the roles file (Requirement 1's end-to-end persistence). Build command: `$janissary/scripts/run.mjs check-diff`.
4. Widen the two import-free plugin mirror contracts: in `src/plugins/connections/shared.ts` change the `AcpRole` alias and `isAcpRole` to accept any non-empty string, and in `src/plugins/shell/shared.ts` widen `ShellAcpRef`, `ShellAcpReceipt` and their guards consistently. Do not bump either payload schema version; the wire shape is unchanged. Keep the guards import-free as required by the tab-plugin contract. Build command: `$janissary/scripts/run.mjs check-diff`.
5. In `src/connection/close.ts`, rewrite `coreAcpTarget` to take the roles-file root as an argument: split the id at its first `:`, and treat the first segment as the role only when `knownRoleSettings(launchDir, segment)` returns settings; otherwise keep today's `ask` fallback with the whole id as suffix. Pass `managers.tab.launchDir` from the single `closeAcp` call site, import `knownRoleSettings` from `../acp/ask-role.js`, and keep `coreAcpTarget` pure. Leave the rest of `closeAcp`, the `acp:<role>:<provider/model>` row form and all other close cases unchanged, and add no reset command. Build command: `$janissary/scripts/run.mjs check-diff`.
6. Add the tests below; every step leaves the tree green and ends with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The connections window is unchanged in layout and interaction. A custom role's session appears as the same core `acp:<role>:<provider/model>` row that `ask` and `tell` produce, with the row's existing Close control and focus behaviour.
2. Dismissal uses the unchanged generic path `connections close acp:<role>:<model>`; there is no new control, badge, colour or key binding.

## Tests

1. Core role tests in `src/acp/manager.test.ts` (or the existing role-focused test file) cover Requirement 1 with a custom role name: the prompt prefix is handled, the role's entries are used and the role state is keyed by the custom name.
2. `src/connection/catalog.test.ts` covers Requirement 3's connection row for a custom role, asserting `acp:<role>:<provider/model>` and `acpRef.scope === 'tab'` with the custom role.
3. `src/connection/close.test.ts` covers Requirements 2 and 3: `connections close acp:<custom>:<model>` closes the custom role's session, and an unrecognised id still falls back to `ask`.
4. `src/acp-records/validation.test.ts` (or its existing test file) pins that a record carrying a roles-file role name round-trips (Requirement 1).
5. The plugin mirrored guards' colocated tests pin that a non-empty custom role name is accepted and an empty one is still refused.

## Out of scope

- Making persona requests actually travel through `AcpManager.promptResult` is subplans 4 and 5; this subplan only makes the pipeline able to carry a custom role.
- Removing the per-persona rows and editor-scope `AcpRef` is subplan 6.
- Exposing role tools as MCP tools is the deferred backlog item from the parent plan.
- No prose documentation page is written here.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a concrete end-to-end check, open a tab whose roles file defines a custom role with a known model, run a core prompt under that role, confirm the connections window shows `acp:<custom>:<provider/model>` with no persona-specific row, then close it with `connections close acp:<custom>:<provider/model>` and confirm the line `Closed connection acp:<custom>:<provider/model>.` appears and the row disappears.
