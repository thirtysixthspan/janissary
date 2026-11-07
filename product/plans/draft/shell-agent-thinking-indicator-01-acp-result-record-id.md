# Answering record id on the ACP prompt result
**Complexity: 3/10** — one optional field on a result type, but it has to survive three paths (a plain settle, a model fallback, and the rebuilt exhausted error) and the file that rebuilds it sits at 198 of 200 counted lines, so a helper moves out; a wrong id would later link the wrong connection tab.

## Goal

Make the `AcpPromptResult` that `AcpManager.promptResult` and `run` hand to their callers carry an optional `recordId`: the durable ACP record that holds the prompt's final block. It is the id of the record that answered, including after a model fallback, and when every model failed it is the record of the last model tried. A refusal carries none. Nothing reads the field yet. Subplan `03-reply-record-and-tell-line` stores it on the settled background reply.

This is the first of eight subplans that split `product/plans/ready/shell-agent-thinking-indicator.md` (the source plan). Later subplans are named by number and slug, for example `02-dispatch-receipt`.

## Design decisions and dependencies

This subplan depends on nothing earlier. `03-reply-record-and-tell-line` consumes the field, and nothing else in the sequence does.

Source plan requirements carried here: "Server changes" bullets on `AcpPromptResult`, on `settleAcpPrompt`, and on the `manager.ts` extraction into `ask-role.ts`; "Once the prompt settles" (the link is pinned to the record that answered, and when every model failed it is the last model's); "Once the prompt settles" (an answer, an `ACP error: …`, `ACP: prompt cancelled.`, and `ACP session closed.` all leave a block, so each result carries the id; a refusal leaves none); the server half of the "Tests" list for `manager-fallback.test.ts`, `ask-role.test.ts`, and `response.test.ts`.

- `AcpPromptResult` in `src/acp/types.ts` gains an optional `recordId` on both variants. The comment above the type says what it means: the record holding the prompt's final block, present only when the prompt reached a record.
- `settleAcpPrompt` in `src/acp/response.ts` is the only caller of `pending.finish` (verified by search: `src/acp/response.ts:47`). It passes `recordId: pending.recordId` on the result when the pending prompt has one, and leaves the result untouched when it has none. The record's own answer text still comes from the original result (`answerCoreRecord` runs first and is not changed), so the id is added only to what `finish` receives. The `cancel()` wrapper in `src/acp/manager.ts` replaces `request.finish` with a function that forwards the same result, so a cancellation carries the id too.
- `promptCoreRecord` in `src/acp/record-feed.ts` sets `pending.recordId` only once `records.prompt` added a block. So the paths that never add a block carry no id: `AcpManager.run`'s refusals (a prompt already running, a usage line, the remote session still connecting, `noRoleModels`), `Tab not found`, and the `attempt` guards for a missing tab or entry. They call `onDone` directly and never reach `settleAcpPrompt`. No code change is needed for them. The tests below pin it.
- Model fallback needs no change in `settleAttempt` for the answered or single-model case, because each attempt has its own pending prompt (`AcpManager.attempt`) and `settleAttempt` forwards the final attempt's result unchanged. A failed attempt that has another model left never reaches `onDone`, so the failed model's id is never the settled one.
- The exhausted case does need a change. `settleAttempt` builds a fresh `{ answered: false, error: exhaustedError(…) }` when `failed && failures.length > 1`, which drops the field. That expression moves to a new helper beside `exhaustedError` in `src/acp/ask-role.ts` (66 counted lines today). Its contract: given the attempt's result, whether the attempt failed on its model, the accumulated failures, and the role, it returns the exhausted-error result carrying the incoming result's `recordId` when the attempt failed with more than one failure, and otherwise returns the incoming result unchanged (same object). Suggested name `finalAttemptResult`. `src/acp/manager.ts` (198 counted lines) calls it from `settleAttempt` in place of the inline expression, so the file does not grow. This is the one extraction this subplan owns: the `attempt.onDone(failed && failures.length > 1 ? … : result)` expression moves from `manager.ts` to `ask-role.ts`.
- `AcpPromptResult` is re-exported by the published plugin contract (`src/plugins/api.ts:32`) and returned by `promptAcpResult` (`src/plugins/acp-capabilities.ts`), so the field becomes visible to plugins. It is optional and additive, so the plugin API version does not move (`ai/guidelines/plugins.md` §4). The two documents that describe the result's shape are updated here: the `promptAcpResult(prompt)` bullet in `product/specs/acp.md` (§ Availability and plugin API) and the `promptAcpResult(prompt)` bullet in `documentation/developer-documentation/tab-plugins.md`. This documentation is not named by the source plan. It is added because the type is part of the published contract and principle 10 of `ai/guidelines/architecture-principles.md` requires the spec to move with it.
- Existing exact-equality assertions on settled results (`manager-fallback.test.ts`, `manager.test.ts`) stay valid. Those suites mock `connectAcp` and never fire the handshake's `onConnect`, so `beginCoreRecord` never runs, no record id reaches a pending prompt, and no `recordId` appears. Confirm by running the suites. The new cases below fire `onConnect` deliberately.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Pending prompt with `recordId` | `AcpPendingPrompt` in `src/acp/prompt-state.ts`; set by `promptCoreRecord` in `src/acp/record-feed.ts` | The source of the id. Unchanged. |
| The single settlement point | `settleAcpPrompt` in `src/acp/response.ts` (43 counted lines today) | Gains the id on the result it passes to `pending.finish`. |
| One pending prompt per model attempt | `AcpManager.attempt` and `settleAttempt` in `src/acp/manager.ts` | `settleAttempt` calls the new helper. Nothing else changes. |
| Exhausted-error text | `exhaustedError`, `AttemptFailure` in `src/acp/ask-role.ts` | The helper wraps it and keeps the id. |
| Result type and its re-exports | `src/acp/types.ts`, `src/plugins/api.ts`, `src/plugins/acp-capabilities.ts` | One optional field added to the type. |
| Fallback test harness | `setup`, `launched`, `loop`, `answer` in `src/acp/manager-fallback.test.ts`, with `acpRecords: { begin, prompt, … }` mocked | The new cases reuse it. |
| Real records and tab manager harness | `setup` in `src/acp/plugin-session.test.ts` (real `AcpSessionRecords`, `TabManager`, `CommandManager`) | Used for the end-to-end assertion in `03-reply-record-and-tell-line`, not here. |

## Proposed changes

- `src/acp/types.ts`: add the optional `recordId` to both variants of `AcpPromptResult` and extend the comment above the type.
- `src/acp/response.ts`: in `settleAcpPrompt`, hand `pending.finish` the result with `recordId: pending.recordId` added when the pending prompt has one. `answerCoreRecord` keeps receiving the original result.
- `src/acp/ask-role.ts`: add the helper described above next to `exhaustedError`, exported, with a comment saying why the id must survive the rebuild.
- `src/acp/manager.ts`: import the helper and call it from `settleAttempt`. The counted line total must be no higher than 198 after the edit; the multi-line import list from `./ask-role.js` is the place where a new name could add a line, and the removed two-line expression offsets it.
- `product/specs/acp.md` and `documentation/developer-documentation/tab-plugins.md`: the `promptAcpResult` bullets gain one sentence each. The result may also name the record holding the prompt's final block, which is the answering model's record or, when every model failed, the last model's, and a refusal names none.

## Tests

Server (vitest project `server`), colocated:

- `src/acp/response.test.ts` (new): `settleAcpPrompt` hands `finish` a result that carries the pending prompt's `recordId` for an answer, for an `ACP error: …` line, for `ACP: prompt cancelled.`, and for `ACP session closed.`. A pending prompt without a `recordId` gets the result unchanged, with no `recordId` key. When the tab or its pending prompt is gone, `finish` is not called and the `afterSettlement` callback still runs. Use a fake `Managers` with just the pieces `settleAcpPrompt` touches, or the real `TabManager` as `plugin-session.test.ts` does. `03-reply-record-and-tell-line` extends this file for `appendAcpBackgroundReply`.
- `src/acp/ask-role.test.ts`: the helper keeps `recordId` on the exhausted error when the attempt failed with more than one failure, and the error text equals what `exhaustedError` returns for the same failures and role. It returns the same object unchanged for a single failure, for an answered result, and for a failed-but-not-model-failure result such as a refusal. An exhausted rebuild from a result with no `recordId` has no `recordId` key.
- `src/acp/manager-fallback.test.ts`: two new cases. First, after a fallback the settled result carries the answering model's record id and not the failed one's: have `acpRecords.begin` return a different id per call (`mockReturnValueOnce`), fire the mocked `connectAcp` options' `onConnect` for the first session so it gets a record, fail it with `loop(0).error(…)`, fire `onConnect` on the second session, answer it, and expect the id of the second. Second, when every model fails the settled error is the exhausted text and carries the last model's record id. Existing cases in this file and in `src/acp/manager.test.ts` must pass unchanged. If one gains a `recordId` and fails, the test fired the handshake, and its expectation is updated to the id it saw.
- `src/plugins/launcher/summarizer.test.ts` and `src/acp/plugin-session.test.ts` run unchanged, as a check that the plugin-visible result still satisfies its consumers.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. `--changed` selects tests by import graph, so also run the named files by path: `npx vitest run --project server src/acp/response.test.ts src/acp/ask-role.test.ts src/acp/manager-fallback.test.ts src/acp/manager.test.ts src/acp/plugin-session.test.ts`. Confirm `src/acp/manager.ts` is still at or under 198 counted lines and that no file touched passes 200.

There is no manual check at this stage: nothing reads the field and the UI does not change. The field is first observable in `03-reply-record-and-tell-line`.

## Out of scope

- The dispatch receipt and the pre-minted reply id (`02-dispatch-receipt`).
- Storing the record on the background entry, its name, the `record` field on the wire, and the `tell` line fix (`03-reply-record-and-tell-line`).
- Any client change.
- Changing how records are created, answered, or closed (`src/acp/record-feed.ts`, `src/acp-records/`).
