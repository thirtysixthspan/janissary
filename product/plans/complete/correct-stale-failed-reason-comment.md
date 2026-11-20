# Correct the stale `failed` reason comment on `AcpLoopHandlers.finished`

**Complexity: 1/10** — one comment line becomes three in a single 142-line file, one documentation-accuracy requirement, no new tests or units (p=2.66)

`AcpLoopHandlers.finished` in `src/acp/types.ts` documents `failed` as the reason when a command throws or rejects. The loop no longer does that: `runAcpToolLoop`'s `finish` takes only `'answered' | 'capped'`, and a throwing or rejecting command is caught in `settle` and delivered as an ordinary result with `ACP error: <message>`. `product/specs/acp.md` already describes the accurate contract. A reader extending a consumer or writing a test can trust the comment and handle a reason the loop never emits, or assume a command error still ends the run.

## Goal

The trailing comment on `AcpLoopHandlers.finished` states the reasons this loop actually emits — `answered` or `capped` — and notes that `failed` stays in the handler's union only for other producers. No code, type, or behavior changes.

## Approach

1. Read `runAcpToolLoop` in `src/acp/loop.ts` and confirm `finish` is called only with `'answered'` and `'capped'`, and that `settle` converts a thrown or rejected command into an ordinary result instead of calling `finish`.
2. Read the tool-loop paragraph of `product/specs/acp.md` for the exact wording: a command error becomes an ordinary result, the run ends only on a reply with no commands or at the cap, and `failed` stays in the union for other producers.
3. Rewrite only the trailing comment on `AcpLoopHandlers.finished` in `src/acp/types.ts`, leaving the handler signature and every other line byte-for-byte unchanged. Keep `src/acp/types.ts` under the 200-line `max-lines` limit.

## Implementation steps

1. Replace the comment at `src/acp/types.ts:111` so it says the loop emits `answered` (the reply had no commands) or `capped` (the step cap was hit), that a command which throws or rejects becomes an ordinary result and never `failed`, and that `failed` remains in the union only for other producers. Match the wording used in `product/specs/acp.md`. Change no code.

## Tests

No new tests — no behavior changes and no test covers comment text. Verify the comment against `runAcpToolLoop` and the spec paragraph, and confirm the existing cases in `src/acp/loop.test.ts` and `src/acp/drive-loop.test.ts` still pass: they already assert that a throwing command and an async rejection become ordinary results and never a `failed` finish. `$janissary/scripts/run.mjs check-diff` is the gate.

## Spec

No spec change — `product/specs/acp.md` already states the accurate contract in its tool-loop paragraph; this edit aligns the code comment with it.

## Out of scope

- Removing `failed` from the `AcpLoopHandlers.finished` reason union; other producers and consumers still use it.
- Changing the loop's control flow, step cap, or error handling.
- Updating help or user documentation; no documented behavior changes.
