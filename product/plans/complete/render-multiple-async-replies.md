# Render every async reply in an ACP connection block

**Complexity: 6/10** — ~40 added production lines across 10 files, 8 requirements, 12 scenarios, 3 new functions (p=5.95)

## Goal

A tracked ACP connection currently stores and renders a single final answer per prompt block. When the model accepts several queries and answers them asynchronously, it can issue a reply to one query before the others have produced results, then follow up with further replies as those results arrive. Those earlier replies are dropped: the loop keeps only the last turn's text as the single `answer`. The additional replies must be captured in the connection record and rendered in the connection tab, in arrival order, alongside the tool activity recorded between them.

## Approach

Add an optional `replies: string[]` field to a connection block holding every reply text the model produced for that prompt, in arrival order. Keep the existing single `answer` field as the settled final answer so status, durability, and records written before this change keep working unchanged; for those legacy records the tab falls back to rendering the single `answer`.

Record each reply as it happens. `AcpSessionRecords.reply` appends a non-empty reply to the block that is still open without settling it, so tool activity from queries that are still running continues to be recorded after an early reply. `answer` remains the settlement step; when no reply was captured during the loop (agent runs and error or reset settlements), it seeds `replies` with the final text so every answered block has at least one reply. Core ACP sessions record each non-empty `endTurn` text through a new `replyCoreRecord` helper; agent runs record each non-empty `endTurn` text through `AgentRecordFeed.reply`.

On the client, render each entry of `replies` as its own Answer section using the existing Markdown path, falling back to the single `answer` when `replies` is absent. Include the latest block's replies in the connection tab's scroll content key so a newly arrived reply refreshes the view. Validate `replies` as an array of strings in both the durable-record and connection-payload guards. The field is optional, so the payload schema version stays unchanged.

## Implementation steps

1. `src/acp-records/types.ts`: add optional `replies?: string[]` to `AcpRecordBlock`.
2. `src/acp-records/manager.ts`: add `reply(id, text)` that appends non-empty text to the last block's `replies`; in `answer`, seed `replies` with the final text when the block has none.
3. `src/acp-records/validation.ts`: accept an optional `replies` array of strings in `isBlock`.
4. `src/acp/record-feed.ts`: add `replyCoreRecord` that resolves the current role's record id the same way `coreActivity` does and forwards the text to `records.reply`.
5. `src/acp/run-prompt.ts`: in the loop's `endTurn` handler, record the non-empty reply text through `replyCoreRecord`.
6. `src/agent/record-feed.ts`: add `AgentRecordFeed.reply(text)` forwarding to `records.reply`.
7. `src/agent/execute.ts`: in the loop's `endTurn` handler, record a non-empty reply through `run.record?.reply`.
8. `src/plugins/connections/shared.ts`: add optional `replies?: string[]` to `ConnectionBlock` and accept it in the payload `isBlock`; leave the schema version at 2.
9. `web/src/plugins/connections/ConnectionHistory.tsx`: render each `replies` entry as an `Answer` section, falling back to the single `answer` for records without `replies`.
10. `web/src/plugins/connections/ConnectionTab.tsx`: include the latest block's replies in the scroll content key.

## Tests

- `src/acp-records/manager.test.ts`: `reply` appends several replies to one block without settling it; activity still records after a reply; `answer` seeds `replies` when none were captured; an empty reply is ignored.
- `src/acp-records/validation.test.ts`: a block with string `replies` validates; non-array and non-string replies are rejected.
- `src/plugins/connections/shared.test.ts`: a window whose block carries `replies` validates; invalid replies are rejected.
- `src/acp/record-feed.test.ts`: a prompt with several turns records each non-empty reply in one block in order, with tool activity between replies retained, and settles once at the end; a single-reply prompt still stores one reply.
- `src/agent/execute.test.ts`: an agent run with several turns records each non-empty reply.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: a block with several replies renders them as separate Markdown Answer sections in order; a block with only `answer` still renders.

## Spec and documentation

- `product/specs/acp-records.md`: state that a connection block records every reply the model produced for a prompt, not just the final one, and that an early reply does not stop later tool activity from being recorded.
- `product/specs/connections-tab.md`: state that the transcript renders every recorded reply in order, not only a single final answer.
- No `help/` or user-documentation change: no command, flag, key binding, or documented user behavior changes.

## Out of scope

- Changing the tool loop's batching, parallel execution, result pump, step cap, or settlement.
- Changing the live tab's streaming/running output behavior; only the durable connection record and its tab rendering change.
- A payload schema-version bump or migration of records already stored on disk; legacy single-answer records keep rendering through the fallback.
- New wire frames, commands, tabs, or record fields beyond `replies`.
- Recording empty or whitespace-only replies.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step and over the complete change set.
