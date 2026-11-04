# Keep loaded prompt windows out of the connections-list payload

**Complexity: 2/10** — one summary projection shared by the list tab's open and update paths, one focused plugin test, and a clarifying sentence in the existing connections-tab spec; no payload schema, record-tab, or client change.

## Goal

Resolve PR #1916's recorded finding: "Technical debt: keep loaded prompt windows out of the connections-list payload."

Today `src/plugins/connections/tabs.ts` copies the connections topic's rows unchanged into both the initial list payload (`openList`) and every list update (`update`). Once a record tab has loaded a history window, every connections delivery carries that record's full prompt history to the singleton list tab, which renders only title, kind, owner, and status. The client therefore validates and retains the window without rendering it, and each coalesced delivery duplicates the record history to the list.

## Approach and evidence

`ConnectionList` reads only `row.title`, `row.kind`, `row.ownerLabel`/`ownerName`, and `row.status`, plus identity and ordering fields; it never reads `row.window`. The record tab owns the entire history view and receives the window through its own payload, built by `ConnectionRecordTabs` from the same topic rows.

`isConnectionRow` treats an own `window` key as present: `hasOwn(value, 'window') && !isWindow(value.window)` fails the row when the key exists but is not a valid window. Assigning `window: undefined` would therefore keep an own key and make the list payload invalid, so the key must be omitted entirely. A rest destructuring after an `'window' in row` narrowing produces a copy without mutating the topic row, which is important because the record payload is built from that same row object in the same delivery.

The summary copy keeps every other field, including optional `acpRef`, `focusTarget`, `runId`, `endedAt`, and the ordering metadata, so list identity, ordering, and row actions behave exactly as before.

## Implementation steps

1. In `src/plugins/connections/tabs.ts`, add a small `listRow` helper that returns a row unchanged when it has no own `window` key and otherwise returns a shallow copy with `window` destructured out.
2. Use that helper for the rows in both `openList`'s `openOrFocusTab` factory payload and `update`'s `ConnectionsPayload`. Leave the `ConnectionList` payload type, `isConnectionsPayload`, `record-tabs.ts`, and the record payload unchanged.
3. Add the case described under Tests to `src/plugins/connections/activate.test.ts`, and keep every existing activation case unchanged.
4. In `product/specs/connections-tab.md`, add one sentence to the connections-tab section stating that the list carries summaries only and a record tab's loaded history travels only with that tab.
5. Run the focused plugin tests, then `$janissary/scripts/run.mjs check-diff`, and fix any failures.
6. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, restoring the comment-and-heading skeleton because it is the only entry.

## Tests

- `src/plugins/connections/activate.test.ts`: open the list while a record row already carries a loaded window and assert the open payload's row strictly equals the windowless summary. Then deliver the same loaded rows to both the list and record tabs and assert the list update's payload row strictly equals the summary while the record update still carries the window. Assert the topic row object still has its window after both list payloads were built, proving the projection copies rather than mutates.
- A strict comparison is required so an own `window: undefined` key fails, matching the payload guard's treatment of an own key.
- Existing paging assertions in `src/plugins/connections-topic.test.ts` stay unchanged and green.

## Out of scope

- `ConnectionRecordTabs`, the record payload, `ConnectionWindow`, the topic row schema, and the payload validators.
- `ConnectionList` rendering, ordering, selection, and intents.
- Lookup and activation reads of the topic data, which need the loaded window for record resolution.
- Help or user-documentation changes; neither describes the internal list delivery.
- Pull request title or body changes, other backlog entries, and merge or history rewriting.

## Completion

- Added a `listRow` summary projection in `src/plugins/connections/tabs.ts` and used it for both the `openList` factory payload and the `update` list payload, omitting the `window` key instead of setting it to `undefined`.
- Left `record-tabs.ts`, the record payload, `ConnectionList`, and every payload validator unchanged; topic rows are copied, never mutated.
- Added one activation case proving the list open and update payloads carry the windowless summary, while the record tab payload in the same delivery still carries the loaded window and the topic row keeps it. The case fails against the previous list payload with the record's window included.
- Focused plugin tests passed: 23 tests across `activate.test.ts` and `connections-topic.test.ts`, keeping the paging assertions green. `$janissary/scripts/run.mjs check-diff` passed lint and typecheck; its diff-scoped server run fails only in the socket-based `src/index.test.ts` cases, which cannot connect to `127.0.0.1` in this workspace sandbox (`EPERM`, reproduced by a bare loopback probe), and no test of the changed modules fails.
- Updated the connections-tab spec to say the list carries each connection's summary only.
- No help or user-documentation change: neither describes the internal list delivery.
- Removed only the resolved backlog entry and restored the file's comment-and-heading skeleton.
