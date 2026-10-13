# Shell tab text transcript 02: rename the transcript RPC to `openTranscriptFileFor`

**Complexity: 3/10** — a behavior-preserving rename of one protocol method through server protocol, params validation, message routing, controller and two web modules, plus their tests; mechanical, but it spans server and web and must leave the exhaustive-handler checks green.

## Goal

Rename the label-keyed RPC `openHarnessTranscriptFor` to `openTranscriptFileFor` everywhere it appears, with behavior unchanged, so subplan 06 can widen it to shell tabs without a new protocol method.

Source plan: implementation-order step 2.

## Design decisions carried from the source plan

- **Decision 16** (the rename half) — the button reaches the server through the existing transcript RPC, renamed `openTranscriptFileFor`; no new protocol method; the rename runs through every place the method name appears. The widening to a shell tab's `tab.transcript` is subplan 06.

## Dependencies

None. Independent of subplans 01 and 03.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| RPC declaration | `src/protocol/core-rpc.ts:58` | Renamed |
| Client message union and params validation | `src/client-message.ts`, `src/client-params/core.ts` | Renamed |
| Message routing | `src/message/handler.ts`, `src/message/tabs.ts` | Renamed |
| Controller surface | `src/controller.ts` | Renamed |
| Controller implementation `openHarnessTranscriptFor(managers, label)` | `src/controller/transcript.ts:10` | Function renamed to `openTranscriptFileFor`; body unchanged in this subplan |
| Sibling comment naming it | `src/controller/recording.ts:14` | Comment updated |
| Web intent and the harness tab that sends it | `web/src/harness/harness-tab-intents.ts`, `web/src/harness/HarnessTab.tsx` | Renamed |

Verified list of files naming the method today (`grep -rln openHarnessTranscriptFor src web/src`): `src/client-message.ts`, `src/client-params/core.ts`, `src/client-params/core.test.ts`, `src/controller.ts`, `src/controller.test.ts`, `src/controller/recording.ts`, `src/controller/recording.test.ts`, `src/controller/transcript.ts`, `src/controller/transcript.test.ts`, `src/message/handler.ts`, `src/message/handler.test.ts`, `src/message/tabs.ts`, `src/protocol/core-rpc.ts`, `web/src/harness/harness-tab-intents.ts`, `web/src/harness/harness-tab-intents.test.ts`, `web/src/harness/HarnessTab.tsx`, `web/src/harness/HarnessTab.test.tsx`. Completed plans under `product/plans/complete/` also name it; they are historical records and are not edited. No spec or user documentation names the method.

## Proposed changes

- Rename `openHarnessTranscriptFor` → `openTranscriptFileFor` in every source file listed above: protocol method name, client-message variant, params validator key, handler/tab-message routing, controller method and its delegate, the controller function in `src/controller/transcript.ts`, the comment in `src/controller/recording.ts`, and the web intent/sender.
- Update the comment above the function in `src/controller/transcript.ts` so it no longer claims to be harness-only in name, while still describing today's harness-only resolution (subplan 06 widens it).
- Behavior is identical: the controller still opens `managers.harness.transcriptTailer(label)?.transcriptFile()` in an editor tab named `transcript <label>` (decision 8's naming) and silently no-ops otherwise.
- After the edit, `grep -rn openHarnessTranscriptFor src web/src` returns nothing.

## Tests

- Move the method name in the tests that name it: `src/message/handler.test.ts`, `src/controller.test.ts`, `src/client-params/core.test.ts`, `src/controller/recording.test.ts`, `src/controller/transcript.test.ts`, `web/src/harness/harness-tab-intents.test.ts`, `web/src/harness/HarnessTab.test.tsx`. Assertions otherwise unchanged.
- `src/message/handler-exhaustive.test.ts` and `src/client-message.test.ts` stay green across the rename (they guard that every client message has a handler and validator).

## Verification

- `./scripts/run.mjs check-diff` — both server and web tests run, since `src/` and `web/src/` both change.
- Manual (optional, quick): open a harness tab, press its **Open transcript** button, and confirm the editor tab `transcript <label>` still opens.

## Out of scope

- Resolving a shell tab's `tab.transcript` in the controller — subplan 06.
- Any client capability or shell button — subplan 07.
