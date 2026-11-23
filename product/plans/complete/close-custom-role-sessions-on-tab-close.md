# Close every core role session when a tab closes, including custom roles

**Complexity: 2/10** — 5 requirements and 3 test scenarios around a 2-line change in 1 production file (p=3.951).

## Goal

`AcpSessionManager.closeTab` currently settles and closes only the two built-in `ACP_ROLES`, so a core session opened under a roles-file custom role survives tab close, `closeAll`, and `dispose`, leaving its ACP subprocess alive. The connection spec already promises that closing a tab kills every core role session it holds. The goal is to make tab close settle and close every role actually held for the tab, so custom roles are torn down just like `ask` and `tell`, without changing the per-role close, `closeAll`, or `dispose` paths.

## Requirements

1. "Close custom-role core sessions when their tab closes, which the built-in-role cleanup loop currently leaves running." `closeTab` settles and closes every role currently held for the label, not just the built-in roles.
2. "so custom roles from the roles file are also closed and their subprocesses killed." A held custom-role session's `kill()` is invoked on tab close.
3. "Because the close settlement callback deletes entries from the map through deleteSession, iterate a snapshot of the keys to avoid skipping roles." The role list is captured before any settlement callback mutates the label's role-session map.
4. "keep the per-role close, closeAll and dispose paths otherwise unchanged." The public behavior of `close`, `closeAll`, and `dispose` is not altered beyond what they inherit from the corrected `closeTab`.
5. "assert that closing the tab closes both the custom role and the built-in roles." Test coverage pins a tab holding a custom role, `ask`, and `tell` ending with all three sessions killed and no session state retained.

## Design decisions

- Drive teardown from the label's own role-session map (`this.sessions.get(label)`) instead of the static `ACP_ROLES` constant, because role names come from a user-edited roles file and no code-side list can enumerate them. This is anchored by the assumption below on `AcpRole = string`.
- Snapshot the map's keys with a spread before entering the close loop, because `settleAcpPrompt` synchronously runs `deleteSession`, which removes the just-closed role from that same map.
- Reuse the existing `close(label, output, role)` for each role so settlement, subagent cleanup, connection-record close, and `kill()` stay in exactly one place.
- Leave `close`, `closeAll`, and `dispose` bodies untouched; `closeAll` already delegates to `closeTab` per label, so it and `dispose` inherit the fix.
- No spec, help, or user/developer documentation edit: `product/specs/connection.md` already claims closing a tab kills every core role session, so the repair aligns behavior with an accurate claim.

## Preserved behavior

1. Per-role `close` must still settle and kill only the selected role's session, leaving other roles' sessions alive; it must not kill or settle them as a side effect. `src/acp/manager.test.ts` ("closes only the session whose model failed") pins it.
2. `closeAll` must still close every held session for every tab and leave no session state behind. `src/acp/manager.test.ts` ("closes every role session with closeAll") pins it.
3. Cancellation must still target only the selected role and keep other roles' prompts running until their own close. `src/acp/manager.test.ts` ("cancels only the selected role and keeps the tab busy until the other role settles") pins it.
4. Independent roles under one tab must still keep their own session identity and model. `src/acp/manager.test.ts` ("keeps role sessions and prompts independent while preserving ask defaults") pins it.

## Assumptions

1. Role names are open strings, not a fixed literal set — `src/acp/role.ts:3` (`export type AcpRole = string;`) and `src/acp/role.ts:1` (`export const ACP_ROLES = ['ask', 'tell'] as const;`). The built-in constant cannot enumerate roles-file names.
2. The authoritative set of held roles per label is `private sessions = new Map<string, RoleSessions>()` — `src/acp/session-manager.ts:25` — with `type RoleSessions = Map<AcpRole, CoreSession>` at `src/acp/session-manager.ts:22`.
3. Settlement mutates that map synchronously: `settleAcpPrompt` calls `afterSettlement` at `src/acp/response.ts:96`, and `close`'s callback calls `deleteSession` at `src/acp/session-manager.ts:150`, which deletes the role entry at `src/acp/session-manager.ts:195`.
4. `closeAll` delegates to `closeTab` (`src/acp/session-manager.ts:161`) and `dispose` delegates to `closeAll` (`src/acp/session-manager.ts:164`), so both inherit a corrected `closeTab` without their own edits.
5. `closeTab` is a public method (`src/acp/session-manager.ts:156`) and can be called directly from `src/acp/manager.test.ts` to pin the tab-close behavior.

## Existing functionality

1. The per-role teardown path `close(label, output?, role)` — `src/acp/session-manager.ts:138` — already settles the prompt, closes the subagent session, and kills the session via its settlement callback.
2. `deleteSession(label, role, holder)` — `src/acp/session-manager.ts:193` — is the mutation that makes a key snapshot necessary.
3. `sessionIdentity(label, role)` and `has(label, role)` — `src/acp/session-manager.ts:37` and `src/acp/session-manager.ts:31` — are the existing test-visible probes for whether a role session is still held.
4. The `setup()` helper and per-role `makeSession()` mocks — `src/acp/manager.test.ts:58` — let a test drive three distinct role sessions and assert each session's `kill` spy.

## Implementation steps

1. In `src/acp/session-manager.ts`, replace the body of `closeTab` so it takes a snapshot of the keys of `this.sessions.get(label)` (empty when the label has no held roles) and calls `this.close(label, output, role)` once for each key in that snapshot. Do not change the signatures or bodies of `close`, `closeAll`, or `dispose`.
2. In the same file, remove `ACP_ROLES` from the `./role.js` import at line 13, keeping `DEFAULT_ACP_ROLE` and the `AcpRole` type, so the now-unused constant does not trip `@typescript-eslint/no-unused-vars`.
3. Run `$janissary/scripts/run.mjs check-diff` and fix any lint, typecheck, or test failure before moving on.

## UI design

None. This repair changes server-side teardown and its tests; no component, layout, key binding, or visible control changes. The user-visible effect is that a tab closed after using a custom-role persona no longer leaves that role's ACP subprocess running.

## Tests

1. Requirement 1 and requirement 2: add a new test in the `AcpManager role sessions` block of `src/acp/manager.test.ts` that starts `ask`, `tell`, and a custom role such as `review-bot` under the same tab with distinct session mocks, calls `acp.closeTab('tab1')` directly, and asserts all three identities and `has` checks are cleared and all three session mocks were killed once. Before the fix, the custom-role session is still held and its `kill` spy is untouched, so this is the regression proof.
2. Requirement 3 and requirement 5: extend the existing "closes every role session with closeAll" test in `src/acp/manager.test.ts` with a third custom-role session, and assert that `closeAll` (through `closeTab`) closes and kills the custom role alongside the built-ins.
3. Requirement 4 / regression coverage: the existing closeAll, cancellation, and role-state tests in `src/acp/manager.test.ts` must keep passing without edits; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Editing `product/specs/connection.md`, any `help/` page, or anything under `documentation/user-documentation/` or `documentation/developer-documentation/`: the recorded entry calls only for a read-only cross-check, and the spec's lifecycle claim is already accurate.
- Changing the pull request title or description, or touching any other backlog entry.
- Changing role-name resolution, the roles file format, the `AcpRole` type, or the `ACP_ROLES` constant itself.
- Altering the settlement, subagent cleanup, connection-record close, or `kill()` logic inside `close`.
- Adding a dependency or a new module.

## Verification

`$janissary/scripts/run.mjs check-diff` first (lint, incremental typecheck, and the affected server tests, including the new direct-`closeTab` custom-role case and the extended `closeAll` case). Then, against the running app with a `review-bot` custom role in the roles file, open a tab, start a core session under `review-bot` as well as the built-in roles, close the tab, and confirm no orphaned ACP subprocess for the custom role remains (for example by checking the process list); a failure shows the custom role's process still alive after the tab is gone. Finally read `src/acp/session-manager.ts` and confirm `closeTab` iterates a snapshot of the label's held role keys, `close`/`closeAll`/`dispose` are unchanged, and `ACP_ROLES` is no longer imported.
