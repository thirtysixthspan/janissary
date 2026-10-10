# Retain SQL drafts until intents are accepted

Complexity: 7/10

## Goal

Keep submitted SQL text, cell edits, and insert forms available until the server accepts their intents, and show request failures locally without replacing database query errors.

## Approach

Have the SQL action adapter catch intent rejections, report a normalized tab-local request error, and return an explicit accepted/rejected outcome for draft-producing operations. Intercept only the console's submit chord around the shared command-bar key handler so Shift+Enter and history recall remain intact. Record history only after acceptance and clear the command line only if it still contains the submitted draft. Extract a small grid submission hook that prevents duplicate cell/insert submissions; close a cell editor or insert form only on acceptance and only if the current cell draft still matches the submitted value. Disable insert form controls while its request is pending. Keep request errors in local tab state and render them separately from the payload's authoritative query error.

## Implementation steps

1. Update `createSqlActions` in `useSqlActions.ts` to normalize rejections, report them through an error callback, and return a boolean acceptance result for `run`, `insertRow`, and `updateCell`.
2. Update `SqlTab` to own a dismissible request error separate from payload errors and pass its setter into the action hook.
3. Update `SqlConsole` to submit asynchronously around the shared key handler, preserve newer drafts, prevent duplicate pending submits, and record only accepted history entries.
4. Extract `useSqlDraftAcceptance` and use it in `DataGrid` to retain failed cell and insert drafts, guard duplicate submissions, and bind success to the submitted cell draft. Keep insert fields disabled only while acceptance is pending.
5. Add tests for adapter rejections, console acceptance/rejection and newer typing, cell edit delayed success/rejection and newer typing, insert form retention, duplicate prevention, and separation of request errors from query errors.
6. Update the SQL database spec for intent acceptance and retained local drafts; check help and public docs for behavior they already describe.

## Tests

- `web/src/plugins/sql/useSqlActions.test.ts`: rejected intent normalization and acceptance outcomes.
- `web/src/plugins/sql/SqlConsole.test.tsx`: rejected/delayed submissions, newer typing, duplicate prevention, and unchanged Shift+Enter/history recall behavior.
- `web/src/plugins/sql/DataGrid.test.tsx`: delayed/rejected cell and insert requests retain drafts, latest cell text survives an older acknowledgement, and duplicate writes are prevented.
- `web/src/plugins/sql/SqlTab.test.tsx`: request error is visible and dismissible without changing the SQL payload's query error.
- Run scoped checks after each implementation step and after the spec/backlog update.

## Out of scope

- Retrying an ambiguous intent automatically.
- Treating transport acceptance as proof the later database operation succeeded.
- Changing authoritative query error or pending payload behavior.
