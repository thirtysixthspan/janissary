# Detect a rate limit that arrives as an `acp` reply, not an error

**Complexity: 2/10** — a one-line detection added to the `acp` command's loop-finished handler, plus a regression test. The detection helper (`isRateLimitError`) and the `rate-limited` notification already exist; the fix only wires them to the answered-reply path that was being missed.

## Root cause

`AcpManager.run` (`src/acp/manager.ts`) only checks `isRateLimitError` inside its `error` handler — the branch that runs when `conn.prompt` throws. But an OpenCode ACP query that is rate limited by the underlying provider frequently does **not** throw: the agent surfaces the provider's rate-limit message as ordinary reply *content* (streamed via `agent_message_chunk`), and the prompt resolves normally through `onEnd`. That path runs the loop's `endTurn`/`finished` "answered" handlers, which never consult `isRateLimitError`. The rate-limit text lands in the transcript as if it were a normal answer and **no `rate-limited` notification fires** — the query fails silently.

## Correct behavior

When an `acp` query comes back rate-limited — whether the failure throws (already handled) **or** arrives as the agent's reply text — a `rate-limited` notification fires (subject to its opt-in toggle), in addition to the existing in-tab output. An ordinary answer still fires no `rate-limited` notification.

## Reproduction

Added a focused unit test in `src/acp/manager.test.ts` that drives the handlers `runAcpToolLoop` is wired with:

```
handlers.endTurn('Error: 429 Too Many Requests. Please try again later.');
handlers.finished('answered', 8);
```

Against the unfixed code the expectation `notify(managers, 'rate-limited', 'tab1')` is never satisfied — only `state-change` fires — so the test fails, confirming the silent failure. A sibling control test with ordinary answer text asserts `rate-limited` does **not** fire.

## Approach

In `AcpManager.run`'s `finished` handler, after emitting `state-change`, check the loop's final answer text (`lastAnswer`, already captured in `endTurn`) with `isRateLimitError`; if it matches, fire `rate-limited` for the tab. This mirrors the existing `error`-handler detection and reuses the same helper and event.

## Implementation

1. **`src/acp/manager.ts`** — in the `finished` handler, add `if (isRateLimitError(lastAnswer)) notify(this.managers, 'rate-limited', label);` immediately after the existing `notify(this.managers, 'state-change', label);` call. No new imports (`isRateLimitError` and `notify` are already imported).

## Regression test

`src/acp/manager.test.ts`:

- `an answered reply whose text is rate-limit-shaped fires a rate-limited notification` — drives `endTurn` with a 429 message then `finished('answered', 8)`, and asserts `rate-limited` fires. Fails without the fix, passes with it.
- `an answered reply with ordinary text does not fire a rate-limited notification` — the control case, guarding against false positives.

Run `./scripts/run.mjs check-diff`.

## Out of scope

- The monitor query paths (`src/monitor/ask.ts`, `src/monitor/manager.ts`) share the same error-only detection shape. They already detect rate limits surfaced as errors; extending content-based detection to their reply text is a separate change beyond this bug, which names the `acp` command.
- Any change to `isRateLimitError`'s marker set or the notification config/toggles.

## Verification

- Run `./scripts/run.mjs check-diff` — the regression test passes and the existing suite is unaffected.
- Manual launch of the app to drive a live rate-limited `acp` query is not possible in this unattended environment (it requires an authenticated OpenCode session hitting a real provider limit); the handler wiring is exercised end-to-end by the unit tests above. Noted in the report.
