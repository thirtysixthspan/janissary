# Consolidate the Connection Tab Follow and Window Rules

**Complexity: 3/10** — a three-file spec consolidation with one new cross-spec link; no code, schema, or behavior changes, but the docs build and every wiki target must still resolve.

## Goal

Give each connection-record-tab rule one home: the popup-opening promises stay in `connections-tab.md`, the full streamed-follow rule moves into the record tab's own section there, and `acp-records.md` keeps the 20-block history window and paging that `connections-tab.md` links to instead of restating the number.

## Approach

The entry's claims hold against the current specs. `connections-tab.md` line 21 restates the record-tab follow behavior as "follows new output ... while the reader remains there; scrolling away pauses following", omits the rule that streamed text growth on the latest activity entry keeps following without a new entry, and repeats the 20-block window twice. `connection.md` "Connection record history" carries the complete rule, including the streamed-update sentence and viewport preservation. `acp-records.md` owns the window contract: a default size of 20, offset, `hasOlder`, and the rule that reads neither publish changes nor remember requested window sizes.

The completed `follow-streamed-connection-activity` repair confirms the behavior the full rule describes: `ConnectionTab` includes the latest activity text in its content key, and `useConnectionHistoryScroll` follows on a content change only while the tab is active and the reader is within the bottom-follow threshold. No implementation change is needed.

Move the history paragraph from `connection.md` into the "The connection tab" section of `connections-tab.md`, then replace it in `connection.md` with a `[[connections-tab]]` pointer. In `connections-tab.md`, keep "Opening a connection tab from the popup" unchanged because it is this subplan's new promise, and replace the weak follow sentence and both 20-block sentences with the full follow rule plus a link to `[[acp-records]]` for the window and its paging. In `acp-records.md`, replace the sentence that hands later windows and 20-block paging increments to the downstream topic with one that keeps them under the same window rules, so the owner and the linking surface do not point at each other.

## Implementation steps

1. In `product/specs/connections-tab.md` under "The connection tab", replace the follow and paging sentences with the full rule: an active connection tab follows its newest activity while the reader is at or near the bottom, including streamed text updates to the latest activity entry even when no new entry is added; scrolling away pauses following until the reader returns; and the tab opens on the newest history window and loads older blocks at the top while preserving the reader's viewport, linking to `[[acp-records]]` for the window and paging.
2. In `product/specs/connection.md` under "Connection record history", replace the paragraph with a pointer stating that connection record history belongs to the record tab described in `[[connections-tab]]`. Leave the editor-tab paragraph that follows the section untouched.
3. In `product/specs/acp-records.md` under "Time and projections", replace the sentence delegating later loaded windows and 20-block paging increments to the downstream topic with one stating that they follow the same window rules, so `acp-records.md` remains the single owner of the window size and paging.
4. Read the three specs together and confirm each rule has one home: popup opening in `connections-tab.md`, streamed follow in `connections-tab.md`, and the window and paging in `acp-records.md`.
5. Run `npm run docs:build` and confirm every `[[...]]` target in the edited specs resolves to a file in `product/specs/`.

## Tests

- `connections-tab.md` contains no "20" and links to `[[acp-records]]` for the window and paging.
- `connections-tab.md` is the only one of the three specs that states the streamed-follow rule, including the "even when no new entry is added" nuance and viewport preservation.
- `connection.md` contains only a `[[connections-tab]]` pointer for record history, not the rule itself.
- `acp-records.md` remains the only spec that states the 20-block window and paging increments, and no longer hands them to the downstream topic.
- `npm run docs:build` succeeds, and every wiki target used by the edited specs names an existing spec file.

## Out of scope

- Changing code, tests, schemas, or runtime behavior.
- Reordering the pre-existing editor-tab paragraph under "Connection record history" in `connection.md`.
- Changing the window size, count validation, offset, `hasOlder`, or subscription semantics in `acp-records.md`, or the popup-opening section in `connections-tab.md`.
- Adding or updating user documentation where no existing page describes record-tab history.
