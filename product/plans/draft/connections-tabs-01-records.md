# Connections session records

**Complexity: 3/10**

## Goal

Add project-scoped durable records for tracked ACP sessions and agent runs. A record survives its tabs, ACP process, and application restart; closed records expire after 30 days.

## Decisions and dependencies

- Implements source-plan requirements 5, 12, 16 (record title derivation), and implementation decision 27 / proposed change 1. A core tab session uses `tab.runtime.acpRecordId`; an agent run owns its record id. Mint record ids with `randomUUID()`, never the per-process `acp-<n>` session identity.
- Persist one versioned JSON record at `.janissary/connections/<id>.json`. Startup recovery converts leftover open ACP records to `Closed` and agent-run records to `Terminated`; expired closed records are deleted. `dispose()` closes open records as `Closed`.
- No dependency on subsequent plans. Later feed and topic plans consume this manager and its stable record/window/row shapes.

## Existing code to reuse

- Use `ConversationStore` in `src/conversations/store.ts` as the precedent for project-scoped JSON persistence and `src/conversations/` record conventions.
- Use `src/acp/activity.ts`'s five activity kinds and `src/agent/run.ts`'s run outcome vocabulary where the record model needs them.
- Follow `Managers` ownership and disposal patterns in `src/managers.ts`.

## Proposed changes

- Add a focused `src/acp-records/` pure model and manager. Include schema version, source kind, title, owning-tab name, started/ended times, prompt blocks, activity entries, final answers, and derived status.
- Expose `begin(source)`, `prompt(id, text)`, `activity(id, kind, text)`, `answer(id, text)`, `close(id, outcome)`, `delete(id)`, `rows()`, and `window(id, count)`. Do not add an independent status setter.
- Derive `Running` while the newest prompt block lacks an answer, `Idle` after an answer while the session remains open, and terminal status from `close`. Preserve agent outcomes (`Completed`, `Failed`, `Terminated`).
- Fold consecutive `message` and `thought` chunks in the same block into a single entry. Derive titles from the first prompt line, capped at 60 characters, and agent task filename; retain the closed record's owning-tab name even if its tab closes.
- Write prompt blocks after completion and write again on close; keep the currently running prompt's activity in memory. Emit `connections:changed` on every mutation. Refuse deletion of open records.

## Tests

- Add `src/acp-records/*.test.ts` cases for activity folding/order, title derivation and cap, serialization round-trip, startup recovery, 30-day expiry, open-record deletion refusal, and one `connections:changed` event per mutation.
- Test dispose closing remaining records and persistence errors according to the existing store's failure behavior.

## Verification

- Run the repository diff-scoped check workflow after changes.
- Confirm record JSON is schema-versioned, project-local, and restart recovery does not depend on reused ACP session ids.

## Out of scope

- Wiring records to ACP sessions, agents, or remote transport; that belongs to the feed/cancellation plan.
- Topic delivery, UI, shell reply behavior, API version changes, and documentation.
- Conversations, monitors, and editor persona sessions remain untracked; non-ACP connection history is not added.
