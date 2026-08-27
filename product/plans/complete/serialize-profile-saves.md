# Serialize profile saves

**Complexity: 4/10** — the collision is prevented at the profile command boundary with a small promise queue and focused manager coverage. Capture and selection protocols remain unchanged.

## Goal

Rapid profile-save commands must capture navigator selection state independently, in command order, so starting a later save cannot abandon an earlier save's pending client request.

## Approach

Give each `ProfileManager` a save queue. Enqueue every save after the prior save settles, including after failure, and route each queued action through the existing success/failure finalizer. This keeps only one `requestTreeSelections` round trip active per manager without changing its single-request protocol.

## Implementation steps

1. Add a failure-tolerant sequential save queue to `ProfileManager`.
2. Route save commands through the queue while preserving existing summaries and failure results.
3. Add manager coverage proving a second save does not request selections until the first settles and that the queue continues after rejection.
4. Document ordered profile saves, remove the backlog entry, and promote this plan after checks pass.

## Tests

- `src/profile/manager.test.ts`: overlapping saves emit selection requests one at a time and both complete with their own responses; a rejected save does not block the next queued save.
- Preserve existing save/launch success and failure coverage.

## Out of scope

- Supporting multiple simultaneous selection requests in the client protocol.
- Parallelizing capture or disk writes.
- Deduplicating identical profile save commands.
- Changing save summary wording or profile serialization.
