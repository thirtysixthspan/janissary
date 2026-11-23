# Reconcile the ACP shared-consumers paragraph with core-pipeline routing

**Complexity: 2/10** — no production lines or files touched; 7 spec requirements and 4 preserved-behavior scenarios (p=3.64)

## Goal

The earlier spec reconciliation rewrote the opening paragraph of `product/specs/acp.md` so editor persona queries run on the tab's core ACP pipeline under the persona's role, but left the paragraph under `## Shared consumers` saying that monitors, conversations, and editor persona queries remain separate ACP consumers with their own lifecycle and do not acquire the tab session. That stale sentence contradicts the repaired opening and reports the separate-consumer model the feature removed. This repair rewrites only that paragraph so the spec is self-consistent. It changes no application code.

## Requirements

1. "monitors and conversations are still described as separate consumers with their own model choices, workspaces, permission policies, and lifecycle" — the rewritten paragraph keeps that description for monitors and conversations.
2. "editor persona queries are described as running on the tab's core ACP pipeline under the persona's role" — the paragraph states core-pipeline routing under the role for editor queries.
3. "reusing that role's session rather than being a separate consumer with a lifecycle of their own" — the paragraph states session reuse and drops the separate-lifecycle claim for editor queries.
4. "drop the claim that they do not acquire the tab session where it applies to editor persona queries" — the "do not acquire the tab session" sentence no longer covers editor queries.
5. "confirm the paragraph no longer contradicts the spec's opening description" — the paragraph agrees with the opening description at `product/specs/acp.md:3`.
6. "Leave every other spec file and the `Authentication outside workspaces` and `Confinement` subsections unchanged" — no other prose is edited.
7. "No test change is needed; confirm the four preserved-behavior web tests stay untouched" — no test file is edited.

## Design decisions

- This is a spec-only repair of a single paragraph. No production code, test, help page, or `documentation/` file is edited (linked to Assumption 1).
- Only the paragraph beginning "Monitors, conversations, and editor persona queries remain separate ACP consumers" under `## Shared consumers` changes. The `Authentication outside workspaces` and `Confinement` subsections and every other spec file stay byte-for-byte the same (linked to Assumption 6).
- The new wording keeps monitors and conversations as separate consumers but moves editor persona queries to the core pipeline, verified against the handler and manager rather than copied from the review text (linked to Assumptions 2 and 3).
- The wording reflects its actual state: leftover editor-scope row and close plumbing still exists until subplan 6, so the paragraph does not claim that plumbing was removed (linked to Assumption 5).
- No new test is written. The four web tests that pin the preserved editor behavior stay untouched (linked to Assumption 7).

## Preserved behavior

1. The query line opens when `>` is typed at the very start of an otherwise-empty line. It must not open for `>` typed mid-line or on a line that already holds text. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("opens the query line when > is typed as the first character of an empty line").
2. Enter, Ctrl+Enter (Cmd+Enter on macOS), and the `run` pill fire a runnable query. It must not insert a buffer newline or fire for a query that is not yet a valid `> <persona> <prompt>`. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("fires on Enter when the query is runnable and never inserts a buffer newline").
3. The status pill keeps its labels and order: `agent?`, `query?`, `run`, `running...`, `no suggestion`. It must not gain wording or change priority. Pinned by `web/src/editor/suggest-request.test.ts` ("shows agent? when no known persona is named yet").
4. Tab completes a persona name and yields to the pill once the request is runnable. It must not complete a name while the pill holds focus. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("focuses the pill on Tab in priority over completion once the request is runnable").

## Assumptions

1. Only the `## Shared consumers` paragraph is wrong; the opening paragraph at `product/specs/acp.md:3` is already correct — `product/specs/acp.md:3` ("editor persona queries instead run on the tab's core ACP pipeline under the persona's role, reusing that role's session").
2. `editorSuggest` sends the query through the core pipeline under the persona's role — `src/editor-suggest/handler.ts:70` (`managers.acp.promptResult(label, fullPrompt, persona.role, { appendRefusalToTranscript: false })`).
3. `AcpManager.run` reuses the role's core session — `src/acp/manager.ts:145` (`const session = this.acquire(label, entry, attempt.role);`) and `src/acp/manager.ts:195` (`private acquire(label: string, entry: RoleEntry, role: AcpRole)`).
4. The stale paragraph under repair is the one beginning "Monitors, conversations, and editor persona queries remain separate ACP consumers" — `product/specs/acp.md:402`.
5. Editor-scope row and close plumbing is unused but still present until subplan 6 — `product/plans/ready/ai-personas-6-drop-per-persona-connection-plumbing.md:76`.
6. No other spec file, and neither the `Authentication outside workspaces` nor `Confinement` subsection, is in scope — `product/specs/acp.md:404` and `product/specs/acp.md:408`.
7. The four preserved-behavior tests live in `web/src/editor/handleSuggestKeyDown.test.ts` and `web/src/editor/suggest-request.test.ts` and describe the query line and pill, not the connection path.

## Existing functionality

1. `AcpManager.promptResult` is the promise-based core prompt entry point — `src/acp/manager.ts:66` (`promptResult(`).
2. `AcpManager.run` resolves the role's connection and reuses its session — `src/acp/manager.ts:145` (`this.acquire(label, entry, attempt.role)`).
3. The spec's opening paragraph already states the correct core-pipeline behavior — `product/specs/acp.md:3` ("reusing that role's session rather than holding one of their own").
4. The spec already lists core role rows as `acp:<role>:<provider/model>` — `product/specs/acp.md:85` ("lists core sessions as `acp:<role>:<provider/model>`").

## Implementation steps

1. In `product/specs/acp.md`, rewrite only the paragraph beginning "Monitors, conversations, and editor persona queries remain separate ACP consumers" under `## Shared consumers`. Keep monitors and conversations as separate consumers with their own model choices, workspaces, permission policies, and lifecycle. Describe editor persona queries as running on the tab's core ACP pipeline under the persona's role and reusing that role's session, not as a separate consumer with a lifecycle of their own, and remove the "do not acquire the tab session" claim as it applies to editor queries. Leave the `Authentication outside workspaces` and `Confinement` subsections and every other spec file unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Confirm no test file changes. Verify the four preserved-behavior web tests named under Preserved behavior are untouched and run the diff-scoped check once more. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No UI surface changes. This plan edits prose only, so no component, style, key binding, or help page is touched.
2. The connection window behavior described in `product/specs/connection.md` is unchanged in the app; only the ACP spec's prose is corrected.
3. The editor query line and its status pill keep their existing placement, labels, and interactions exactly as documented in `product/specs/editor-tab.md`.

## Tests

No new tests. This plan changes no application behavior and adds no code. The four preserved-behavior tests named under Preserved behavior stay unedited and must still pass.

## Out of scope

- Any production code change, including removing the leftover editor-scope row and close plumbing; that is subplan 6.
- Any edit to another spec file, or to the `Authentication outside workspaces` or `Confinement` subsections of `product/specs/acp.md`.
- Any edit under `documentation/user-documentation/` or `documentation/developer-documentation/`.
- Any edit under `help/`, any new test, and any change to the pull request description.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a reading-based manual check, read `product/specs/acp.md:3` and `product/specs/acp.md:402` together and confirm the opening and shared-consumers paragraphs now agree: monitors and conversations remain separate consumers with their own model choices, workspaces, permission policies, and lifecycle, while editor persona queries run on the tab's core ACP pipeline under the persona's role and reuse that role's session rather than holding one of their own. Confirm the "do not acquire the tab session" claim no longer applies to editor queries, that `Authentication outside workspaces` and `Confinement` are unchanged, and that `git diff -- web/src/editor/handleSuggestKeyDown.test.ts web/src/editor/suggest-request.test.ts` shows no change. A paragraph that still calls editor persona queries a separate consumer with their own lifecycle means the repair is incomplete.
