# Answering record and the tell line on settled replies
**Complexity: 3/10** — four small server edits (a log entry field, a reply-view projection, one wire field, one regex), but the regex also changes where every `tell` reply lands in the shell today, which moves an existing assertion and needs a spec sentence.

## Goal

Make a settled background reply say which record answered: store `{ id, name }` on the log entry when the prompt result carries a record id and the record still exists, and project it onto the wire as `record`. In the same step make `tell` replies carry their command line the way `ask` replies do, so a `tell` reply is placed beneath its own echo instead of a `> monitor` one, and `tell reset`'s confirmation lands beneath its own `> tell reset` echo. After this subplan the server half of the feature is complete.

## Design decisions and dependencies

This subplan consumes two earlier contracts. From `01-acp-result-record-id`: `AcpPromptResult` has an optional `recordId` on both variants, kept on the exhausted error. From `02-dispatch-receipt`: `appendAcpBackgroundReply(managers, label, input, result, id)` takes the id minted at dispatch, and `recordConnectionName` from `src/plugins/connections/shared.ts` is the agreed way to build `acp:<role>:<name>`. `06-marker-lifecycle` and `07-client-wiring` consume the wire field.

Source plan requirements carried here: "Server changes" bullets on `appendAcpBackgroundReply` looking the record up and storing `{ id, name }`, on `LogEntry.backgroundRecord`, on `ACP_INPUT` matching `tell`, on `backgroundRepliesFor` copying the record as `record`, and on `BackgroundReplyView`; "Edge cases" (today a `tell` reply is written beneath `> monitor`; this makes it carry its line; `tell reset` is placed beneath its own echo and still gets no marker); "Once the prompt settles" (a refusal creates no block, so nothing is stored for it; a record deleted mid-prompt stores nothing); the server half of "Tests" for `response.test.ts` and `background-replies.test.ts`; "Documentation" for the `tell` placement sentence.

- `appendAcpBackgroundReply` (`src/acp/response.ts`): when `result.recordId` is set, find that id in `managers.acpRecords.rows()` and store `backgroundRecord: { id, name }` beside `background`. `name` is `recordConnectionName` applied to the row (its `kind`, `ownerName`, and `role`), which yields `acp:<role>:<ownerName>`, the title the connection tab takes. `ownerName` is the tab title captured when the record began, so the link's name can differ from the running marker's name if the tab was renamed mid-prompt; that is accepted. A row with no `role` (a record that predates roles) would yield `acp:<ownerName>`; a prompt that reached a record always has a role, so this is unreachable here. A record no longer in the rows (deleted mid-prompt) stores nothing. A result with no `recordId` stores nothing. Spread the field in conditionally; never write `backgroundRecord: undefined`.
- `LogEntry` in `src/tab/types.ts` (189 counted lines) gains one optional field, `backgroundRecord?: { id: string; name: string }`, next to `background`, with a comment. That adds one counted line, so the file stays at 190.
- `backgroundRepliesFor` (`src/tab/background-replies.ts`) copies `backgroundRecord` onto the view as `record` when present. `BackgroundReplyView` in `src/protocol/tab.ts` gains the optional `record: { id: string; name: string }`, and the comment above it, which says only `line` is optional today, says so. `src/protocol.ts` already re-exports the type, and the client reads it through `@shared/protocol`, so wire types stay defined once (principle 7).
- `ACP_INPUT` becomes a pattern that matches `ask` or `tell` with the same optional leading slash and word boundary, and its comment follows (it says it mirrors `src/commands/ask.ts`; it now mirrors `ask.ts` and `tell.ts`). `monitor ask …` input still matches neither because the pattern is anchored at the start. `acp …`, an empty input, and ordinary entries are unchanged. The entries that carry `background` today come only from ACP replies, the two resets, `monitor ask` (`src/monitor/ask.ts`), and live monitor suggestions (empty input), so no other producer is newly matched.
- The user-visible effect of the `tell` fix is real before the client work: the shell already writes a reply under `reply.line ?? 'monitor'`, so a `tell` reply that carries its line is now placed by the existing `ReplyPlacement` rules beneath its own echo or beneath a second `> tell …` echo. The spec says so (see below).
- Existing assertions that change: `src/commands/tell-reset.test.ts` line 31 expects `backgroundRepliesFor(tab)` to equal `[{ id, output }]` for a `tell reset`, and must now expect the reply's `line` too, as `src/commands/ask-reset.test.ts` already does for `ask reset`. The source plan does not name this test. `src/tab/view.test.ts` and `src/tab/background-replies.test.ts`'s existing cases are unaffected (`acp hello` and `monitor ask now` still carry no line). Some server tests mock `managers.acpRecords` without a `rows` method (for example `manager-fallback.test.ts`); they only reach `rows()` if a `recordId` is present, which they never produce because they do not fire the handshake. A test that does must provide `rows`.
- Specs and docs ride here: `product/specs/shell-tab.md` § Core ACP connections says nothing about `tell` today; it gains a sentence that `tell <prompt>` is echoed and placed exactly like `ask <prompt>`, and that `tell reset` reports once beneath its own exact typed line like `ask reset`. The published reply shape is documented in `product/specs/tab-plugins.md` (the sentence in the API 3 paragraph that says "Background replies gain an optional `line`: ACP replies, including reset confirmation, carry the exact command they settle under") and in `documentation/developer-documentation/tab-plugins.md` (the two places that describe `onBackgroundReply` and its optional `line`). Each gains that `ask` and `tell` replies, resets included, carry the line, and that a reply for a prompt that reached a record also carries an optional `record` with the record's id and connection name. Those plugin-facing edits are not named by the source plan. They are added because the optional field is part of what `onBackgroundReply` delivers.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Settled reply entry | `appendAcpBackgroundReply` in `src/acp/response.ts` | Gains the record lookup. |
| Record rows with `ownerName` and `role` | `AcpSessionRecords.rows()` in `src/acp-records/manager.ts`, rows built by `recordRow` in `src/acp-records/model.ts` (`AcpRecordRow`) | The lookup source. |
| Connection tab title | `recordConnectionName` in `src/plugins/connections/shared.ts` | Builds `name`. |
| Reply projection | `backgroundRepliesFor` in `src/tab/background-replies.ts`, called by `src/tab/view.ts` | Gains `record`; regex widened. |
| Wire type | `BackgroundReplyView` in `src/protocol/tab.ts`, re-exported by `src/protocol.ts` | Gains `record`. |
| Log entry type | `LogEntry` in `src/tab/types.ts` | Gains `backgroundRecord`. |
| End-to-end harness | `setup` in `src/acp/plugin-session.test.ts` (real `AcpSessionRecords`, `TabManager`, `CommandManager`, and a mocked `connectAcp` whose `onConnect` fires at once) | One case checks the whole server path. |
| Reset tests with the view assertion | `src/commands/ask-reset.test.ts` (already expects `line`), `src/commands/tell-reset.test.ts` | The pattern for the changed assertion. |

## Proposed changes

- `src/acp/response.ts`: extend `appendAcpBackgroundReply` as described.
- `src/tab/types.ts`: add `backgroundRecord` to `LogEntry`.
- `src/tab/background-replies.ts`: widen `ACP_INPUT` to `ask|tell`, update its comment, and copy `backgroundRecord` to `record`.
- `src/protocol/tab.ts`: add `record` to `BackgroundReplyView` and update its comment.
- `product/specs/shell-tab.md`, `product/specs/tab-plugins.md`, `documentation/developer-documentation/tab-plugins.md`: the sentences above.

## Tests

Server (vitest project `server`), colocated:

- `src/acp/response.test.ts` (created in `01-acp-result-record-id`): `appendAcpBackgroundReply` stores `backgroundRecord` with the row's id and the name `acp:<role>:<ownerName>` when the result has a `recordId` and `rows()` lists it, for a `tell` row as well as an `ask` row; stores nothing when the id is missing from the rows; stores nothing for a result with no `recordId`; and the entry has no `backgroundRecord` key in the last two cases.
- `src/tab/background-replies.test.ts`: a `tell` reply, a `/tell` reply with the leading slash, and a `tell reset` reply carry their line; a `monitor ask` reply and an `acp hello` reply still do not; `backgroundRecord` reaches the view as `record`; an entry without it produces a view with no `record` key.
- `src/commands/tell-reset.test.ts`: update the line 31 expectation to include `line`.
- `src/acp/plugin-session.test.ts`: one end-to-end case with real records. Dispatch `ask hello` with `dispatchLineWithOutput`, answer it through the mocked session, and expect the settled entry's `background` to equal the receipt's `replyId` and its `backgroundRecord` to equal `{ id: managers.acpRecords.rows()[0].id, name: 'acp:ask:consumer' }`; then expect `backgroundRepliesFor(tab)` to show the same `record` and the typed `line`. Add the same for `tell hello`, and a refused second prompt that settles under its own id with no `record`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then the named files by path with `npx vitest run --project server src/acp/response.test.ts src/tab/background-replies.test.ts src/tab/view.test.ts src/commands/tell-reset.test.ts src/commands/ask-reset.test.ts src/acp/plugin-session.test.ts src/acp/manager-fallback.test.ts`. Confirm `src/tab/types.ts` is at or under 200 counted lines.

One manual check is possible now, because the existing client already places replies by their `line`. In a running shell tab, run `tell list the files here`, then run `ls` before the tell settles. The reply should land beneath a second `> tell list the files here` echo, not beneath a `> monitor` echo. Then run `tell reset` and confirm its confirmation lands beneath its own `> tell reset` echo. A person or a browser-capable tool does this; an agent inside a workspace sandbox cannot start a browser (`ai/guidelines/sandbox-e2e-browser.md`). The `record` field itself is not visible in the UI until `07-client-wiring`.

## Out of scope

- Any client change: the marker, the link, and reading `record` (`04` through `07`).
- Changing how `ask reset` and `tell reset` build their replies, or giving them a record or a receipt.
- A marker on `tell reset`. Only its placement changes here, through the line fix.
- The shell client's `useBackgroundReplies` and writers (`07-client-wiring`).
