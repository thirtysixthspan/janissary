# Reconcile the editor persona specs with core-pipeline routing

**Complexity: 2/10** — no production lines or files touched; 11 spec requirements and 4 preserved-behavior scenarios (p=3.92)

## Goal

In-editor persona queries now run through the tab's core ACP pipeline under the persona's role, but four functional specs still describe a persistent, per-persona connection with its own connection row and close control, and still call editor queries a separate, unrecorded ACP consumer. This repair rewrites those paragraphs so the specs describe the behavior users actually see. It changes no application code.

## Requirements

1. "a query now goes through the tab's core ACP pipeline under the persona's role" — `product/specs/editor-tab.md` says this plainly for editor persona queries.
2. "the role's session, grants and primer are reused" — that paragraph says the query uses the role's existing session rather than starting a new one.
3. "the persona body, hunk format, buffer and request line are sent on every request" — that paragraph says all four parts go out on each query.
4. "no per-persona connection is created" — that paragraph says the editor opens no dedicated connection for a persona.
5. "a second query under an already-active role surfaces `ACP: a prompt is already running.` through the `<persona>: <message>` notification while the active prompt is untouched" — that paragraph names the refusal and its notification route.
6. "editor personas are no longer listed as a connection kind" — the `acp` row in `product/specs/connection.md`'s Kinds table names only core role sessions and monitors.
7. "no longer produce `<persona> (acp)` rows with their own close control" — the connection-window paragraphs describe only core ACP rows.
8. "no longer have a per-persona close target" — the `connections close acp:<id>` bullet has no editor-persona branch, and the connection-id resolution paragraph gives no persona id.
9. "the remaining row/close plumbing is removed in subplan 6" — the connection spec says the old editor-scope rows and close path are still present but unused until that subplan.
10. "editor persona queries are no longer called a separate ACP consumer with their own lifecycle" — `product/specs/acp.md` describes them as using the core pipeline.
11. "it no longer says editor persona sessions are unrecorded" — `product/specs/acp-records.md` says these queries get core records.

## Design decisions

- This is a spec-only repair. No production code, test, help page, or `documentation/` file is edited (linked to Assumption 1).
- In `product/specs/editor-tab.md`, only the two named paragraphs in "In-editor persona suggestions" change. The query-line, status-pill, and hunk-preview paragraphs stay byte-for-byte as they are (linked to Assumption 7).
- Each rewritten paragraph states what the handler does now, verified against the code rather than copied from the report that raised the finding (linked to Assumptions 2, 3, 4, and 5).
- The connection spec distinguishes what is merely unused today from what subplan 6 removes, so a reader does not conclude the old row and close plumbing is already gone (linked to Assumption 6).
- No new test is written. The four web tests that pin the preserved editor behavior stay untouched (linked to Assumption 8).

## Preserved behavior

1. The query line opens when `>` is typed at the very start of an otherwise-empty line. It must not open for `>` typed mid-line or on a line that already holds text. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("opens the query line when > is typed as the first character of an empty line").
2. Enter, Ctrl+Enter (Cmd+Enter on macOS), and the `run` pill fire a runnable query. It must not insert a buffer newline or fire for a query that is not yet a valid `> <persona> <prompt>`. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("fires on Enter when the query is runnable and never inserts a buffer newline").
3. The status pill keeps its labels and order: `agent?`, `query?`, `run`, `running...`, `no suggestion`. It must not gain wording or change priority. Pinned by `web/src/editor/suggest-request.test.ts` ("shows agent? when no known persona is named yet").
4. Tab completes a persona name and yields to the pill once the request is runnable. It must not complete a name while the pill holds focus. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("focuses the pill on Tab in priority over completion once the request is runnable").

## Assumptions

1. `editorSuggest` is the RPC handler behind an in-editor persona query — `src/editor-suggest/handler.ts:28` (`export function editorSuggest`).
2. The handler calls the core pipeline with the persona's role and refuses to write refusals into the transcript — `src/editor-suggest/handler.ts:70` (`managers.acp.promptResult(label, fullPrompt, persona.role, { appendRefusalToTranscript: false })`).
3. The prompt carries the persona body, hunk format, live buffer, and request line every time — `src/editor-suggest/handler.ts:68` (`const fullPrompt = [persona.body, HUNK_FORMAT, bufferBlock, \`Request: ${params.prompt}\`].join('\n\n');`).
4. Failures go out as `<persona>: <message>` notifications through `finish` — `src/editor-suggest/handler.ts:58` (`notify(managers, NOTIFY_CHANNEL, label, \`${persona.name}: ${failureMessage}\`)`).
5. The core refusal settles without touching the active prompt — `src/acp/manager.ts:89` (`existingAcpRoleRuntime(runtime, role)?.prompt ? 'ACP: a prompt is already running.'`) and `src/acp/manager.ts:100` (`onDone({ answered: false, error });`).
6. `EditorAcpManager` and its `connectionsFor` rows remain in the tree unused — `src/editor/acp-manager.ts:84` (`connectionsFor(label: string): ConnectionView[]`) and `product/plans/complete/ai-personas-4-editor-queries-on-the-core-acp-pipeline.md:24` ("left in place but unused by the handler in this subplan").
7. The two editor-tab paragraphs to rewrite are the ones starting "The first request to a given persona" and "A persona connection whose agent fails to start" — `product/specs/editor-tab.md:742` and `product/specs/editor-tab.md:754`.
8. The four preserved-behavior tests live in `web/src/editor/handleSuggestKeyDown.test.ts` and `web/src/editor/suggest-request.test.ts` and describe the query line and pill, not the connection path.

## Existing functionality

1. `AcpManager.promptResult` is the promise-based core prompt entry point — `src/acp/manager.ts:66` (`promptResult(`).
2. `AcpManager.run` already owns the per-role overlap refusal and settles it without cancelling the active prompt — `src/acp/manager.ts:89`.
3. The core catalog already lists role-qualified `acp:<role>:<provider/model>` rows — `src/connection/catalog.ts:40` (`id: \`${role}:${model}\``).
4. Core ACP records are described as the only recorded ACP history in `product/specs/acp-records.md:3`, which the provenance paragraph contradicts.
5. `product/specs/acp.md:85` already states that the connections panel lists core sessions as `acp:<role>:<provider/model>`, which the shared-consumers paragraph should agree with.

## Implementation steps

1. In `product/specs/editor-tab.md`, rewrite only the two paragraphs identified in Assumption 7. State that a query goes through the tab's core ACP pipeline under the persona's role, reusing that role's session, grants and primer; that the persona body, hunk format, buffer and request line go out on every request; that no per-persona connection is created; and that a second query under an already-active role surfaces `ACP: a prompt is already running.` through the `<persona>: <message>` notification while the active prompt stays untouched. Leave the query-line, status-pill, and hunk-preview paragraphs unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `product/specs/connection.md`, correct the `acp` Kinds row, the id-resolution paragraph, the `connections list` paragraph, the `connections close acp:<id>` bullet, the tab-close lifecycle paragraph, and the connection-window paragraphs. Drop editor personas as a connection kind and as a `<persona> (acp)` row with its own close control, remove the persona close target, and say the remaining row and close plumbing is removed in subplan 6 while no row is produced now. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `product/specs/acp.md`, amend the opening shared-consumers paragraph so editor persona queries are no longer described as a separate ACP consumer with their own lifecycle; they use a tab's core ACP pipeline under the persona's role. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `product/specs/acp-records.md`, amend the provenance paragraph so it no longer lists editor persona sessions as unrecorded and says these queries run on the core pipeline and get core records. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Do not add tests. Confirm the four preserved-behavior tests are untouched and run the diff-scoped check once more. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No UI surface changes. This plan edits prose only, so no component, style, key binding, or help page is touched.
2. The connection window described in `product/specs/connection.md` is unchanged in the app: it shows the tab's core `acp:<role>:<provider/model>` row when an editor persona query runs, with no persona-specific row or close control produced from the query.
3. The editor query line and its status pill keep their existing placement, labels, and interactions exactly as documented in `product/specs/editor-tab.md`.

## Tests

No new tests. This plan changes no application behavior and adds no code. The four preserved-behavior tests named under Preserved behavior stay unedited and must still pass.

## Out of scope

- Any production code change, including removing `EditorAcpManager`, the editor-scope `AcpRef`, the `closeEditorConnection` message, or the persona row plumbing; that is subplan 6.
- Any edit under `documentation/user-documentation/` or `documentation/developer-documentation/`.
- Any edit under `help/`, and any change to the pull request description.
- Any new test, since no code behavior changes here.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a reading-based manual check, open the four edited specs and confirm: `editor-tab.md` says the query uses the core pipeline under the persona's role, reuses the role's session, grants and primer, sends the persona body, hunk format, buffer and request line on every request, creates no per-persona connection, and surfaces `ACP: a prompt is already running.` through the `<persona>: ` notification while the active prompt is untouched; the query-line, status-pill, and hunk-preview paragraphs still read as before; `connection.md` no longer lists editor personas as a kind, a `<persona> (acp)` row, or a close target, and notes that the leftover plumbing goes in subplan 6; `acp.md` and `acp-records.md` no longer call editor queries a separate unrecorded consumer. Finally, check `git diff -- web/src/editor/handleSuggestKeyDown.test.ts web/src/editor/suggest-request.test.ts` shows no change. A stale sentence about a persistent per-persona session, row, close control, or unrecorded editor persona query means the repair is incomplete.
