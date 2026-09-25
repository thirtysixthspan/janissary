# Keep filesystem paths out of the launch-failure close reason

**Complexity: 3/10** — one function body in the guard, two sentences of documentation, and two test cases. The length bound stays because a close frame is still capped; what changes is that the string inside it is a fixed phrase in the guard's own vocabulary rather than whatever a filesystem or a spawn happened to say.

## Summary

`launchFailure` puts the raw text of a start failure into the close frame, and the failures that reach it are the scratch allocation and the child spawn. A filesystem error names the janissary installation root, the browser's scratch path and the host account's home directory — handed to an agent confined inside a workspace, through a channel where every other reason is a fixed phrase from the frame filter and where no such detail helps decide anything. The human already gets the whole account through the report `stopSession` composes, so the detail belongs there and not here.

## Design decisions

1. **A fixed phrase, in the guard's own words.** `e2e browser failed to start` is the same sentence the report opens with and the same shape the filter's reasons have: short, no filesystem detail, the same answer whatever the client did. A client that needs to know which failure occurred is a client that should be reading the notifications tab, which the runtime manual already points it at.

2. **The truncation goes, and the cap is a comment.** A websocket close frame is still capped at 123 bytes, but a fixed phrase is 27 characters inside one, so the bound had nothing left to bound. Keeping a `.slice` that can never fire would be a guard against nothing and a claim that the reason is still something to be trimmed; the cap is recorded in the comment beside the phrase instead, where the next person rewording it will read it.

3. **The detail is not lost, it moves.** `stopSession` already composes the report with `withChildOutput` and writes the whole account to the browser's log file, so the account reaches the human in full — through the notification, the band, and the log, none of which are read by the confined agent the close reason is aimed at.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The shape a close reason should have | the filter's own reasons | `src/browser/e2e-frame-filter.ts` |
| Where the full account reaches the human | `withChildOutput` in the report | `src/browser/e2e-session.ts:92` |
| The sentence both the phrase and the report already use | `e2e browser failed to start` | `src/browser/e2e-server.ts` |

## Proposed changes

1. **`src/browser/e2e-guard.ts`.** `launchFailure` goes away and the fixed phrase is authored at the one place it is used, in `bridge`'s catch. The comment beside it says why the phrase is fixed and where the detail goes instead, and the `errorText` import leaves with it.

2. **`ai/guidelines/sandbox-e2e-browser.md`.** The first-connect paragraph says the close reason says the browser did not start, and that the human's notifications tab carries the detail.

3. **`product/specs/harness.md`.** The "or reports why it could not" clause says the same thing.

## Tests

- `src/browser/e2e-guard.test.ts`: the case asserting a rejected supplier's reason expects the fixed phrase rather than the supplier's own text, and a new case has a supplier reject with an `EACCES` error naming a filesystem path, asserting that no part of that path reaches the close frame.
- The retry case, which counts attempts rather than reading the reason, is unchanged.

## Out of scope

- No change to the frame filter, the buffering, or the close code.
- No new information channel to the agent, and no change to what the human is told.

## Verification

`./scripts/run.mjs check-diff`.
