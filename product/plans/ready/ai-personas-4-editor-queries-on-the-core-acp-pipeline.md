# Run editor persona queries through the core ACP pipeline

**Complexity: 3/10** — ~40 added lines concentrated in one production handler, 4 requirements and 6 prompt/notification scenarios (p=4.54)

## Goal

Editor in-buffer persona queries currently open a dedicated monitor-style session owned by `EditorAcpManager`. This subplan moves them onto the same core ACP pipeline that `ask` and `tell` use, so the persona's role owns the connection and its grants and primer, while the query-line interaction and status pill stay exactly as they are. The editor path uses the role validation delivered in subplan 2 and the widened role typing from subplan 3.

This subplan decomposes `./product/plans/complete/ai-personas.md` and depends on `./product/plans/ready/ai-personas-1-role-directive-format.md`, `./product/plans/ready/ai-personas-2-role-resolution-and-validation.md` and `./product/plans/ready/ai-personas-3-core-role-widening-and-generic-close.md`.

## Requirements

1. "Migrate editor agent support to the same acp pipeline that the ask and tell commands use" — `editorSuggest` drives its query through `AcpManager.promptResult` / `AcpManager.run` with the persona's role.
2. "When the persona is used, the role must be used in the acp connection" — the role resolved in subplan 2 is the role passed to the core prompt call.
3. "Reuse the core refusal" — a persona request fired while that role's core prompt is already active settles with `ACP: a prompt is already running.` and surfaces through the existing `<persona>: <message>` editor notification; the active prompt is untouched. Core ACP sessions are per tab, so this collision is confined to one tab and needs no new queue or cancellation path.
4. Preserve the four query-line and status-pill behaviors listed under Preserved behavior.

## Design decisions

- The editor handler keeps its RPC contract, persona-name matching, notification wording and hunk parsing; only the session/connection mechanism behind them changes (linked to Assumption 1).
- The core prompt is addressed to the owning editor tab's label from `ownerLabel`, so the connection, record and role state are the tab's existing core ones; no per-persona session map is used by the handler after this change (linked to Assumption 2).
- The single-shot prompt text still carries the persona body, the hunk-format instructions and the buffer block, followed by the request line. The role's own primer supplies grants and tooling, replacing the old per-persona priming text; the persona body is not dropped because it is what tells the model to act as an editing assistant (linked to Assumption 3).
- The core result is the completion contract: an answered result is parsed for hunks, an error result becomes a `<persona>: <message>` notification, and an empty or hunk-less answer becomes `<persona>: no suggestion`. Passing `appendRefusalToTranscript: false` keeps refusal and error reporting in the notification rather than the transcript (linked to Assumption 4).
- The `EditorAcpManager` instance is left in place but unused by the handler in this subplan; its rows, close route and maps are removed in subplan 6 once both consumers are off the old path. This avoids a compile error here without deferring any reference.
- No new binding, component, badge or CSS is introduced; the query line and pill are reused unchanged (linked to Assumption 5).

## Preserved behavior

1. The query line opens when `>` is typed at the very start of an otherwise-empty line. It must not open when `>` is typed mid-line or on a line that already holds text. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("opens the query line when > is typed as the first character of an empty line").
2. Enter, Ctrl+Enter (Cmd+Enter on macOS) and the `run` pill fire a runnable query. It must not insert a buffer newline or fire when the query is not yet a valid `> <persona> <prompt>`. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("fires on Enter when the query is runnable and never inserts a buffer newline").
3. The status pill keeps its exact labels and ordering: `agent?` before a persona is named, `query?` once named, `run` when runnable, `running...` in flight, `no suggestion` after an empty reply. It must not gain new wording or a different priority. Pinned by `web/src/editor/suggest-request.test.ts` ("shows agent? when no known persona is named yet").
4. Tab completes a persona name in the query text and yields to the pill once the request is runnable. It must not complete a name while the pill holds focus. Pinned by `web/src/editor/handleSuggestKeyDown.test.ts` ("focuses the pill on Tab in priority over completion once the request is runnable").

## Assumptions

1. `editorSuggest` is the RPC handler for in-editor persona queries and already owns persona matching, notification wording and hunk parsing — `src/editor-suggest/handler.ts:30` (`export function editorSuggest`).
2. `ownerLabel` resolves the owning editor tab's label from the URL — `src/editor-suggest/handler.ts:14` (`export function ownerLabel`).
3. The prompt currently joins persona body, `HUNK_FORMAT` and the wrapped buffer before the request line — `src/editor-suggest/handler.ts:72` (`const primingText = isFirstTurn ? [persona.body, HUNK_FORMAT, bufferBlock].join('\n\n') : bufferBlock;`).
4. `PromptResultOptions.appendRefusalToTranscript` controls whether a refusal is written to the transcript — `src/acp/prompt-state.ts:8` (`appendRefusalToTranscript?: boolean;`).
5. The query line and pill are client-side and unchanged by a server handler swap — `web/src/editor/handleSuggestKeyDown.ts:31` (`completePersonaName(...)`) and `web/src/editor/suggest-request.ts` (`suggestPillLabel`).
6. Core sessions are per tab and per role — `src/acp/role-state.ts:16` (`const states = runtime.acpRoles ??= {};`). `managers.acp` is the `AcpManager` that owns `promptResult` — `src/managers.ts:44` (`acp: AcpManager;`).
7. `editorSuggest` is invoked with a `resolve` callback from `src/controller/editor-adapter.ts:36` (`editorSuggest: (params, callback) => editorSuggest(managers, params, callback)`), so it must keep its synchronous signature and settle the callback from the returned promise.
8. Editor in-buffer queries are typed as `> <persona> <prompt>` and offer the editor-specific persona set — `product/specs/editor-tab.md:697-702` ("In-editor persona suggestions"). The query-line surface, not the server transport, is what this preserves.

## Existing functionality

1. `AcpManager.promptResult` is the promise-based core prompt entry point — `src/acp/manager.ts:67` (`promptResult(`).
2. `AcpManager.run` already produces the shared `ACP: a prompt is already running.` refusal when a role prompt is active — `src/acp/manager.ts:91`.
3. `parseHunks` already turns the model reply into editor hunks — `src/editor-suggest/handler.ts:6` (`import { HUNK_FORMAT, parseHunks } from './reply-format.js';`).
4. `notify` already formats consumer failures — `src/notifications/index.ts` (`export function notify`).
5. The role validation helper from subplan 2 is already available in `src/acp/ask-role.ts` (`resolvePersonaRole`).

## Implementation steps

1. In `src/editor-suggest/handler.ts`, keep the persona-name match and the `loadPersona` + `resolvePersonaRole` sequence from subplan 2 unchanged. Replace the `EditorAcpManager`-based session creation, first-turn priming and `session.prompt` call with one call to `managers.acp.promptResult(label, fullPrompt, persona.role, { appendRefusalToTranscript: false })`. Build `fullPrompt` from the persona body, `HUNK_FORMAT`, the wrapped buffer block and the request text; do not branch on a first turn, because the core role owns session continuity. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Settle the returned promise through the existing `finish` path without changing `editorSuggest`'s synchronous signature: use `.then(...)` on the `promptResult` promise. A result with `answered: true` is passed to `parseHunks` and returned as hunks; a result with `answered: false` calls `finish([], result.error)` so the existing `<persona>: <message>` notification fires; an empty hunk list keeps the existing `no suggestion` notification. Do not add a second callback or change the RPC reply shape. Keep the pill's `running...`/`no suggestion` contract intact by leaving the web side untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Remove the handler's now-unused `EditorAcpManager` calls (`hasSession`, `session`, `record`, `connectionLost`) and their local hooks, but leave the class itself and its `Managers` field in place for subplan 6. Do not delete `closeEditorConnection` or the connection row machinery yet. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Add the tests below and confirm the four preserved-behavior tests still pass untouched. Build command for every step: `$janissary/scripts/run.mjs check-diff`; every step leaves the tree green.

## UI design

1. Editor in-buffer persona queries remain on the ephemeral query line from `product/specs/editor-tab.md`, with the persona name after `>`; this is the only editor surface involved.
2. The tab's connections window now shows the core `acp:<role>:<provider/model>` row used by the query. No `<persona> (acp)` row is created by this handler; removing any existing row plumbing is subplan 6.
3. No new surface is added. Dismissal is through the generic core close path with the row's existing Close control; no persona-specific control appears.
4. Failures surface through the existing `<persona>: <message>` notification. The pill falls back to `no suggestion` and the query line stays open with its text for retry.
5. No key bindings are added; the reused core row keeps its existing accessible name, and `help/keys.md` gains no entry. Visuals are unchanged: `EditorLine` keeps `editor-row-query`, the `editor-suggest-pill` badge keeps its style, and no CSS is added.

## Tests

1. `src/editor-suggest/handler.test.ts` covers Requirement 1 (the query is sent through `AcpManager.promptResult` with the persona's role), Requirement 2 (the resolved role is the one passed) and Requirement 3 (an already-active role prompt yields `ACP: a prompt is already running.` in a `<persona>: ` notification, with no second prompt started).
2. The same file covers the answered, errored and empty-reply branches of step 2, tying each to Requirements 1 and 3.
3. The four preserved-behavior tests named above are left unedited and must still pass, pinning Requirement 4.

## Out of scope

- Removing `EditorAcpManager`, the editor-scope `AcpRef`, the `closeEditorConnection` message and the persona connection rows is subplan 6.
- The monitor path's move to the core pipeline is subplan 5.
- The prose documentation page remains a follow-up candidate, not a plan requirement.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a concrete end-to-end check against the running app, open an editor tab whose buffer holds text, type `> assistant rewrite this paragraph in one sentence` on an empty line, press Enter, and confirm the reply previews an inline change whose accept/decline works as before. While the query is in flight, confirm the connections window shows the core `acp:<role>:<provider/model>` row and no `<persona> (acp)` row, and that firing a second query under the same role while the first is active surfaces `assistant: ACP: a prompt is already running.` without disturbing the first prompt.
