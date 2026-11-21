# Discover nested opencode subagents recursively

**Complexity: 4/10** — ~30 added lines in 3 files, 6 requirements and 6 scenarios, one new helper function (p=5.025).

## Summary

Per the backlog: "Make opencode child-session discovery recursive so nested subagents reach the transcript instead of being dropped after one level."

An opencode harness tab tails one SQLite session and reads the turns of any subagent session whose `parent_id` points at it, labeling those turns `subagent <id>`. Both readers (the original schema and the opencode 2.0 schema) currently find children with a single `WHERE parent_id IN (...)` query against the resolved session, so a subagent spawned by a subagent is never added to the session list and its turns never reach the tab's live transcript or persisted transcript file. This change walks the parent chain outward, a level at a time, so descendants at any depth are discovered.

## Design decisions

- **Expand a frontier, not a recursive SQL CTE.** Each poll query takes the ids discovered so far on the current level and returns their direct children. This reuses the existing `placeholders`/`query` helpers and the same `(time_created, id)` message query that already accepts an arbitrary `session_id IN (...)` list. It also makes the bounding rules easy to see and test.
- **One shared helper, two table names.** The expansion loop is identical except for the session table (`session` versus `session_v2`), so it lives once in the existing `opencode-db.ts` helper module and both readers call it. This avoids duplicating the loop without introducing a new module.
- **Three bounds keep a poll finite.** Ids already in the session list are skipped, so a malformed `parent_id` loop cannot re-add a session; a depth cap stops a pathological chain; and a total-session cap stops a wide tree from growing the `IN (...)` list without limit. The existing behavior of re-reading the child set on every poll is kept, so subagents that appear mid-run are still picked up.
- **Everything downstream is unchanged.** The cursor, the `subagent <id>` source label, the message query, and the part decoding stay as they are. Only the contents of the discovered session list change.

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| Parameterized `IN (...)` queries and row reading | `placeholders` / `query` | `src/harness/transcript/opencode-db.ts` |
| One-shot child discovery in both readers | `discoverChildren` | `src/harness/transcript/opencode.ts`, `src/harness/transcript/opencode-v2.ts` |
| Message query over an arbitrary session list with the `(time_created, id)` cursor | `readMessages` | both readers |
| Child-session fixtures for both schemas | child-session cases in one suite | `src/harness/transcript/opencode.test.ts` |
| User-visible behavior of subagent-labeled transcript entries | the opencode bullet in Session transcripts | `product/specs/harness-recording.md` |

## Proposed changes

**`src/harness/transcript/opencode-db.ts`.** Add `discoverDescendants(database, table, sessions)`: starting from a frontier containing the current session list, loop while the frontier is nonempty and the depth cap is not reached, query `SELECT id FROM <table> WHERE parent_id IN (<placeholders>)`, and append each returned id that is not already in `sessions` until the total cap is reached; the newly appended ids become the next frontier. Restrict `table` to the two known session-table names. Use a depth cap of 16 and a total-session cap of 128. Add a short comment explaining that the three bounds stop malformed cycles and wide trees from spinning a poll.

**`src/harness/transcript/opencode.ts` and `src/harness/transcript/opencode-v2.ts`.** Replace the body of `discoverChildren` with a single call to `discoverDescendants`, passing `'session'` and `'session_v2'` respectively. Keep the method, its call site in `poll`, the cursor, and the label untouched. No file approaches the 200-line `max-lines` cap.

## Tests

**Server** (vitest project `server`, colocated `src/harness/transcript/opencode.test.ts`):
- For the flat-column schema and the data-column schema and the v2 schema: add a parent, child, and grandchild fixture with one turn each, and assert all three turns appear in order with the parent turn unlabeled and both descendants labeled `subagent <id>`.
- For each schema, add a fixture whose `parent_id` rows include a cycle (a self-parent and a two-node loop) alongside a normal chain, and assert the poll returns the chain's turns and terminates rather than spinning or duplicating turns.
- Keep every existing assertion unchanged, including the single-level child cases and the second-poll cases.

Mirror the existing helper functions (`addSession`, `addJsonSession`, `addV2Session`, the message helpers) and assertion style; no new test file.

## Out of scope

- The SQLite polling cursor, table-presence probes, message query, and part decoders.
- The `subagent <id>` label format and the transcript normalizer.
- The Claude and Codex adapters, which discover subagents by other means.
- A shared polling state machine across the two readers (separate backlog item).
- Query-failure diagnostics (separate backlog item).

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after each change and confirm lint, typecheck, and the affected `server` tests pass.
- Update the opencode bullet in `product/specs/harness-recording.md` so it records that nested descendants are read, not only direct children.
- Manual check: with an opencode harness that nests a subagent inside a subagent, confirm the grandchild's turns appear in the tab transcript and the persisted transcript file, each labeled with its own session id.
