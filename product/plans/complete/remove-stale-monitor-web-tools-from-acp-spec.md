# Remove the stale monitor web-tools example from the ACP spec's permission paragraph

**Complexity: 1/10** — one sentence rewritten in a single spec paragraph, no production code and no added tests (10 requirements, p=3.27).

## Goal

`product/specs/acp.md` still says the shared ACP transport's blanket permission denial is overridden by "a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run". This pull request removed monitor-owned sessions and their tools line, so a monitor has no allowlist of its own; monitors now drive the owner tab's core ACP role session. The goal is to replace that stale clause with the approvers that still exist, so a contributor reading the ACP spec does not design against a monitor-owned web-tool allowlist that no longer exists.

## Requirements

1. The permission paragraph no longer cites a monitor's own web-tool allowlist as an approver. From the entry's Proposal: "replace 'only a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run approves one'".
2. The permission paragraph names an autonomous run as an approver. From the entry's Proposal: "naming the still-valid approver (an autonomous run …)".
3. The permission paragraph names a consumer that supplies its own `allowedTools` to `connectAcp` as an approver. From the entry's Proposal: "or a consumer that supplies its own `allowedTools` to `connectAcp`".
4. The permission paragraph states that core role sessions deny harness permission requests. From the entry's Proposal: "state that core role sessions … deny harness permission requests".
5. The permission paragraph states that core role sessions driven by monitor personas deny harness permission requests too. From the entry's Proposal: "including those driven by monitor personas".
6. The new wording matches `decidePermission(options.allowedTools, ...)` in `src/acp/index.ts`, where an autonomous run approves an allow option and every other caller falls through to the allowlist decision. From the entry's Proposal: "Verify the new wording against the `decidePermission(options.allowedTools, ...)` call in `src/acp/index.ts`".
7. The new wording matches `src/acp/tools.ts`, where an absent or empty `allowedTools` denies every request and only direct `connectAcp` callers supply the option. From the entry's Proposal: "and the `allowedTools` handling in `src/acp/tools.ts`, where that option is supplied only by direct `connectAcp` callers".
8. The new wording matches `src/monitor/live-monitors.ts`, where monitor flushes call `managers.acp.promptResult` on the owner tab's core role session rather than spawning a connection with an allowlist. From the entry's Proposal: "and against `src/monitor/live-monitors.ts`, where monitor flushes call `managers.acp.promptResult` instead of spawning their own connection".
9. Only the paragraph beginning "The session's configured provider/model appears in its connection row after the handshake" changes in `product/specs/acp.md`; every other paragraph stays byte-for-byte intact. From the entry's Proposal: "edit only the paragraph beginning …" and "Leave every other paragraph of `product/specs/acp.md` … untouched".
10. A read-back of the edited paragraph confirms no "monitor's web tools" claim remains. From the entry's Proposal: "Read the paragraph back after editing and confirm no 'monitor's web tools' claim remains".

## Design decisions

- Change only the named permission paragraph in `product/specs/acp.md`; the fix is a prose reconciliation, not a behavior change, so no source, test, help page, or documentation-tree file is edited.
- Keep the two already-accurate halves of the sentence: role connections deny every internal tool in two layers, and a denial on an `ask` or `tell` session appears as a `permission` activity entry. Only the clause listing who may override the transport denial is replaced.
- Name the two real override paths — an autonomous run, and a direct `connectAcp` caller that supplies its own `allowedTools` — because `src/acp/index.ts:101` approves when `options.autonomous === true` and `src/acp/index.ts:110` otherwise passes `options.allowedTools` to `decidePermission`.
- State explicitly that core role sessions, including monitor-persona ones, deny harness permission requests, because `src/monitor/live-monitors.ts:122` runs each flush through `managers.acp.promptResult` on the owner tab's core role session with no allowlist.
- Leave every other file untouched: all other `acp.md` paragraphs, all other specs, all source files, and the pull request description and title.
- Verify by reading the rewritten paragraph against the three call sites and by re-reading the paragraph to confirm the stale claim is gone; no new tests are invented for prose.
- The resolved entry is the sole backlog item, so removing it restores `./product/backlog/pull-request.md` to the exact master comment-and-heading skeleton.

## Preserved behavior

1. Core role sessions deny every harness tool permission request — they must not approve a request through an implicit monitor allowlist; the existing test `denies a tool permission request when no tools are allowed` in `src/acp/index.test.ts` pins this.
2. An autonomous run still approves an allow option — it must not be recast as a consumer allowlist; the existing test `approves provider permissions only for an explicitly autonomous connection` in `src/acp/index.test.ts` pins this.
3. A direct `connectAcp` caller that supplies `allowedTools` still approves a classified web tool — it must not lose that override; the existing test `selects the allowed option for a permitted web tool` in `src/acp/index.test.ts` pins this.
4. A permission denial is still reported through the activity observer on an `ask` or `tell` session — it must not be dropped from the connection record; the existing test `records a denial when the allowlist excludes the requested tool` in `src/acp/index.test.ts` pins this.

## Assumptions

1. `src/acp/index.ts:101` — `if (options.autonomous === true)` selects an allow option and returns it, which makes an autonomous run a real approver.
2. `src/acp/index.ts:110` — `const outcome = decidePermission(options.allowedTools, params.toolCall, params.options);` is the only non-autonomous approval path.
3. `src/acp/tools.ts:30` — `if (!allowedTools || allowedTools.length === 0) return { outcome: 'cancelled' };` proves an absent or empty allowlist denies unconditionally.
4. `src/acp/types.ts:57` — `allowedTools?: string[];` is an optional `AcpOptions` field; grep shows no production caller sets it, so only direct `connectAcp` callers can supply it.
5. `src/monitor/live-monitors.ts:122` — `void this.managers.acp.promptResult(reg.owner, prompt, reg.persona.role, { appendRefusalToTranscript: false }).then(` proves a monitor flush runs on the owner tab's core role session without an allowlist.
6. `src/conversations/sessions.ts:30` — the conversation path calls `connectAcp` with no `autonomous` or `allowedTools`, so it denies harness permission requests.
7. `product/specs/acp.md:43` is the paragraph the backlog entry names, and it holds the clause "only a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run approves one".
8. The earlier plan `product/plans/complete/reconcile-acp-spec-monitor-session-routing.md:27` explicitly left this permission sentence untouched, so it is the remaining stale claim.
9. The invocation names the sole entry in `./product/backlog/pull-request.md` as its work item, and the orchestrator overrides the complexity-7 cutoff for this entry.

## Existing functionality

1. The two-layer role-tool denial is already implemented in `src/acp/internal-tools.ts` (deny-all harness configuration) and `src/acp/index.ts:110` (`decidePermission`), so the prose only needs to describe it.
2. The autonomous approval branch at `src/acp/index.ts:101` already provides one of the two approvers the rewritten clause must name.
3. The allowlist classifier and decision at `src/acp/tools.ts:10` (`classifyTool`) and `src/acp/tools.ts:25` (`decidePermission`) already provide the second approver.
4. The monitor flush call at `src/monitor/live-monitors.ts:122` already routes to the owner tab's core role session, so no monitor allowlist exists to describe.
5. The backlog entry's `Proposal` in `./product/backlog/pull-request.md` supplies the authorized wording and scope.
6. `$janissary/scripts/run.mjs check-diff` is the available diff-scoped verification command.

## Implementation steps

1. Record this fix plan under `./product/plans/` (draft, then ready, then complete) with its complexity line; no application code is involved. Run `$janissary/scripts/run.mjs check-diff` after recording it.
2. In `product/specs/acp.md`, edit only the paragraph beginning "The session's configured provider/model appears in its connection row after the handshake": replace the clause "only a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run approves one" with wording that names an autonomous run and a consumer that supplies its own `allowedTools` to `connectAcp` as the approvers, and that states core role sessions, including those driven by monitor personas, deny harness permission requests. Leave the rest of the paragraph and every other paragraph byte-for-byte intact. Run `$janissary/scripts/run.mjs check-diff` after the edit.
3. Read the edited paragraph back and confirm the "monitor's web tools" claim is gone and no other paragraph changed. Run `$janissary/scripts/run.mjs check-diff` after the check.
4. Remove the resolved entry whole from `./product/backlog/pull-request.md`; because it is the sole entry, restore the file to the exact master comment-and-heading skeleton. Run `$janissary/scripts/run.mjs check-diff` after the edit.
5. Commit the plan and backlog change with `$janissary/scripts/run.mjs pr-commit` and push to the recorded head branch, then confirm the pull request is still OPEN and its `headRefOid` matches `git rev-parse HEAD`.

## UI design

None. This is a functional-spec prose correction; it changes no command, flag, key binding, or user interface.

## Tests

No new tests. The fix changes only prose in `product/specs/acp.md`, adds no code, and changes no application behavior, so there is nothing to test. The permission tests in `src/acp/index.test.ts` are left untouched and must keep passing.

## Out of scope

- Editing any paragraph of `product/specs/acp.md` other than the one named by the entry, or editing any other spec.
- Editing any source file, test, help page, or the `documentation/user-documentation/` and `documentation/developer-documentation/` trees.
- Changing the pull request title or description.
- Merging, closing, or replacing pull request 2185.

## Verification

`$janissary/scripts/run.mjs check-diff` after each step, and once more after the backlog is drained — expected to exit 0 with no lint, typecheck, or test regression.

Then, concrete read-based checks: re-read the paragraph beginning "The session's configured provider/model appears in its connection row after the handshake" in `product/specs/acp.md` and confirm it names an autonomous run and a consumer supplying its own `allowedTools` to `connectAcp` as the only approvers, states that core role sessions including monitor-persona ones deny harness permission requests, and contains no "monitor's web tools" claim. Use `git diff -- product/specs/acp.md` to confirm that single paragraph is the only change in the spec. Read `src/acp/index.ts:101`, `src/acp/index.ts:110`, `src/acp/tools.ts:30`, and `src/monitor/live-monitors.ts:122` and confirm the prose matches those call sites. Run `npx vitest run --project server src/acp/index.test.ts` and confirm the permission tests pass untouched. Read `./product/backlog/pull-request.md` and confirm it holds only the leading comment and `# pull-request` heading. Finally `gh pr view 2185 --json state,headRefName,headRefOid,url` must show state OPEN and a `headRefOid` equal to `git rev-parse HEAD`.
