# Reconcile the ACP spec's monitor-session claims with core-pipeline routing

**Complexity: 1/10** — four prose paragraph rewrites in one spec file, no production code and no added tests (9 requirements, p=3.20).

## Goal

`product/specs/acp.md` still says monitors retain their own sessions over the shared ACP transport and groups them with conversations as separate consumers with their own model choices and sessions. The delivered monitors instead drive the owner tab's core ACP role session under the persona's role for flushes, `monitor ask` prompts, and resets, sharing the per-role refusal boundary with `ask`, `tell`, and editor persona queries. The goal is to bring those four stale paragraphs in line with the code and with the already-correct `monitoring.md` and `editor-tab.md` specs, so a contributor reading the ACP spec designs against the right isolation boundary.

## Requirements

1. The introduction no longer describes monitors as retaining their own sessions over the shared protocol transport. From the entry's Proposal: "rewrite the introduction sentence that says monitors retain separate sessions over the shared protocol transport".
2. The introduction describes monitor flushes as running on the owner tab's core ACP role session under the persona's role. From the entry's Proposal: "their flushes and `monitor ask` prompts run on the owner tab's core ACP role session under the persona's role".
3. The introduction describes `monitor ask` prompts as running on that same core role session. From the entry's Proposal: "rather than in a session of their own" and "like editor persona queries".
4. The Shared consumers paragraph no longer groups monitors with conversations as separate consumers with their own model choices and sessions. From the entry's Proposal: "Rewrite the 'Shared consumers' paragraph that groups monitors with conversations as separate consumers with their own model choices and sessions".
5. The Shared consumers paragraph states that monitors reuse the tab's core role session. From the entry's Proposal: "state instead that monitors reuse the tab's core role session".
6. The Shared consumers paragraph states that monitors can hit the same per-role `ACP: a prompt is already running.` refusal as `ask`, `tell`, and editor queries. From the entry's Proposal: "can hit the same per-role 'a prompt is already running' refusal as ask, tell and editor queries".
7. The Shared consumers paragraph states that monitors use the role's grants through the core path. From the entry's Proposal: "and use the role's grants through the core path".
8. The credentials paragraph no longer offers "a monitor session" as an example of an agent outside a workspace. From the entry's Proposal: "update the credentials paragraph that offers 'a monitor session' as an example of an agent outside a workspace".
9. The sandbox paragraph no longer says "ordinary shell and monitor sessions use their working directory" in a way that implies a monitor-owned subprocess session. From the entry's Proposal: "and the sandbox paragraph that says 'ordinary shell and monitor sessions use their working directory' so neither implies a monitor-owned subprocess session; the applicable boundary is the owner tab's core session".

## Design decisions

- Change only `product/specs/acp.md`; the fix is a prose reconciliation, not a behavior change, so no source, test, help page, or documentation-tree file is edited.
- Keep the accurate claim that conversations have their own ACP agent sessions — `product/specs/conversations.md:63` says "Each conversation has one live ACP agent session at a time." — so only monitors are removed from the separate-consumer grouping.
- Mirror the wording already used for editor persona queries in `product/specs/editor-tab.md:742`, with the persona's role and the owner tab's core session as the boundary.
- Leave `product/specs/monitoring.md` and `product/specs/editor-tab.md` byte-for-byte intact; they already describe the delivered routing.
- Leave every other `acp.md` paragraph untouched, including the permission-request sentence at line 43 and the transcript-snapshot sentence at line 87.
- Verify by reading the four rewritten paragraphs against the call sites and by grepping the spec tree for surviving monitor-session wording; no new tests are invented for prose.

## Preserved behavior

1. A flush runs one prompt on the owner tab's core role session under the persona's role rather than starting a monitor-owned session — it must not open a new connection for the monitor; the existing test `batches multiple entries into one prompt per tick` in `src/monitor/manager.test.ts` pins this.
2. A prompt fired while the core role is busy settles with the per-role refusal without disturbing the active prompt — it must not queue or cancel; the existing test `a prompt fired while the core role is busy settles with the refusal and leaves the active prompt untouched` in `src/monitor/manager.test.ts` pins this.
3. `monitor ask` queries the core role session and lands its reply in the owner tab's transcript — it must not use a separate consumer session; the existing test `ask queries the core role session and lands the reply in the owner transcript` in `src/monitor/manager.test.ts` pins this.
4. A context reset closes the owner tab's core session for the persona's role and re-primes the next prompt — it must not merely clear a private monitor buffer; the existing test `resetContext closes the core session and re-primes the next prompt` in `src/monitor/manager.test.ts` pins this.
5. Stopping a monitor leaves the tab's core session alone and stops feeding — it must not close a session other consumers use; the existing test `stop leaves the tab's core session alone and stops feeding` in `src/monitor/manager.test.ts` pins this.
6. A second monitor with the same owner and name is refused by name — it must not be treated as a new session on the same role; the existing test `rejects a second monitor with the same owner and name` in `src/monitor/manager.test.ts` pins this.

## Assumptions

1. `src/monitor/live-monitors.ts:118` — `this.managers.acp.promptResult(reg.owner, prompt, reg.persona.role, { appendRefusalToTranscript: false })` proves a flush runs on the owner tab's core role session.
2. `src/monitor/ask.ts:32` — `managers.acp.promptResult(owner, fullPrompt, reg.persona.role, { appendRefusalToTranscript: false })` proves `monitor ask` uses the same core entry point under the persona's role.
3. `src/monitor/live-monitors.ts:93` — `this.managers.acp.close(reg.owner, undefined, reg.persona.role)` proves a reset closes that core role session, not a private one.
4. `src/monitor/manager.ts:23` — "Each monitor drives the owner tab's core ACP role session with its persona's instructions on the first prompt" is the code's own statement of the routing.
5. `product/specs/monitoring.md:9` — "A monitor runs on the owner tab's core ACP connection under the persona's role (see [[acp]]), so it opens no session of its own to announce."
6. `product/specs/editor-tab.md:742` — "An editor persona query goes through the tab's core ACP pipeline under the persona's role, so it uses that role's session, grants and primer rather than opening anything of its own."
7. `product/specs/conversations.md:63` — "Each conversation has one live ACP agent session at a time." Conversations genuinely keep their own sessions, so that half of the old claims stays.
8. `product/specs/acp.md:3`, `product/specs/acp.md:35`, `product/specs/acp.md:404`, and `product/specs/acp.md:412` are the four stale paragraphs named by the backlog entry.
9. The invocation names the sole entry in `./product/backlog/pull-request.md` as its work item, and the orchestrator overrides the complexity-7 cutoff for this entry.

## Existing functionality

1. The core prompt entry point `managers.acp.promptResult(owner, prompt, role, options)` already serves monitor flushes at `src/monitor/live-monitors.ts:118` and `monitor ask` at `src/monitor/ask.ts:32`.
2. The core session reset `managers.acp.close(owner, undefined, role)` already serves monitor resets at `src/monitor/live-monitors.ts:93`.
3. The accurate prose at `product/specs/monitoring.md:9` and `product/specs/editor-tab.md:742` already states the routing this plan aligns `acp.md` to.
4. The backlog entry's `Proposal` in `./product/backlog/pull-request.md` supplies the authorized wording and scope.
5. `$janissary/scripts/run.mjs check-diff` and `npx vitest run --project server src/monitor/manager.test.ts` are the available diff-scoped and targeted verification commands.

## Implementation steps

1. Record this fix plan under `./product/plans/` (draft, then ready, then complete) with its complexity line; no application code is involved. Run `$janissary/scripts/run.mjs check-diff` after recording it.
2. Rewrite the final sentence of the introduction in `product/specs/acp.md` so conversations retain their own sessions while monitors run flushes and `monitor ask` prompts on the owner tab's core ACP role session under the persona's role, like editor persona queries, rather than in a session of their own, with links to `[[editor-tab]]`, `[[monitoring]]`, and `[[conversations]]`. Run `$janissary/scripts/run.mjs check-diff` after the edit.
3. Rewrite the `## Shared consumers` paragraph in `product/specs/acp.md` so conversations remain the separate consumers with their own model choices, workspaces, permission policies, and lifecycle, while monitors reuse the owner tab's core role session under the persona's role, can hit the same `ACP: a prompt is already running.` refusal as `ask`, `tell`, and editor queries, and use the role's grants through the core path rather than a session of their own. Keep the existing `See [[monitoring]], [[conversations]], and [[editor-tab]].` line. Run `$janissary/scripts/run.mjs check-diff` after the edit.
4. Replace the example "a monitor session" in the `### Authentication outside workspaces` credentials paragraph with a core role session on a tab with no workspace, leaving the rest of the paragraph unchanged. Run `$janissary/scripts/run.mjs check-diff` after the edit.
5. Replace "ordinary shell and monitor sessions use their working directory" in the `### Confinement` paragraph with wording that names ordinary shell role sessions and the owner tab's core role session a monitor runs on, leaving the rest of the paragraph unchanged. Run `$janissary/scripts/run.mjs check-diff` after the edit.
6. Remove the resolved entry whole from `./product/backlog/pull-request.md`; because it is the sole entry, restore the file to the exact master comment-and-heading skeleton. Run `$janissary/scripts/run.mjs check-diff` after the edit.
7. Commit the plan and backlog change with `$janissary/scripts/run.mjs pr-commit` and push to the recorded head branch, then confirm the pull request is still OPEN and its `headRefOid` matches `git rev-parse HEAD`.

## UI design

None. This is a functional-spec prose correction; it changes no command, flag, key binding, or user interface.

## Tests

No new tests. The fix changes only prose in `product/specs/acp.md`, adds no code, and changes no application behavior, so there is nothing to test. The existing flush, reset, stop, refusal, and collision tests in `src/monitor/manager.test.ts` are left untouched and must keep passing.

## Out of scope

- Editing `product/specs/monitoring.md` or `product/specs/editor-tab.md`; both already describe the delivered core-pipeline routing.
- Editing any source file, test, help page, or the `documentation/user-documentation/` and `documentation/developer-documentation/` trees.
- Changing any other paragraph in `product/specs/acp.md`, including the permission-request sentence at line 43 and the transcript-snapshot sentence at line 87.
- Changing the pull request title or description.
- Merging, closing, or replacing pull request 2185.

## Verification

`$janissary/scripts/run.mjs check-diff` after each editing step, and once more after the backlog is drained — expected to exit 0 with no lint, typecheck, or test regression.

Then, concrete read-based checks: re-read the introduction, `## Shared consumers`, `### Authentication outside workspaces`, and `### Confinement` paragraphs in `product/specs/acp.md` and confirm each states the owner tab's core role session as the monitor boundary and none describes a monitor-owned session. Grep `product/specs` for `monitor session`, `retain their separate sessions`, `separate ACP consumers`, and `use their working directory` and confirm the stale monitor-session claims in `acp.md` are gone (the quoted `restarting monitor session` error line in `monitoring.md:88` is a literal log message and stays). Read `src/monitor/live-monitors.ts:118`, `src/monitor/ask.ts:32`, and `src/monitor/live-monitors.ts:93` and confirm the prose matches those call sites. Run `npx vitest run --project server src/monitor/manager.test.ts` and confirm the flush, reset, stop, refusal, and collision tests pass untouched. Read `./product/backlog/pull-request.md` and confirm it holds only the leading comment and `# pull-request` heading. Finally `gh pr view 2185 --json state,headRefName,headRefOid,url` must show state OPEN and a `headRefOid` equal to `git rev-parse HEAD`.
