# Route the conversations plugin's intents through the shared dispatcher

## Complexity

5/10 — one shared helper gains an optional per-entry pre-check, one plugin's hand-rolled three-function chain collapses into a table, and the rejection vocabulary flows through the helper. The risk is the rejection strings: seven hand-written `invalid … payload` sentences and one `unknown … intent` sentence must keep answering exactly what they answer today.

## Goal

`src/plugins/define-intents.ts` exists to give every plugin one intent dispatcher — narrow the tab payload, reject an unknown intent name, check the named entry's payload — and twelve bundled plugins use it. `src/plugins/conversations/activate.ts` re-implements all three steps in a private three-function chain and spells the rejection sentence out seven times, because the helper takes a flat table keyed by intent name while conversations' tab payload is a discriminated union whose `kind` has to be narrowed before an intent name means anything. A user who sends a malformed conversations intent is told `invalid create payload`, `invalid send payload`, or `invalid conversations payload` depending on the branch they hit, while the same mistake against any other plugin reads `invalid <intent> payload`; the wording is pinned only in the conversations test, so the next change to the shared rejection vocabulary reaches twelve plugins and misses the thirteenth with nothing failing.

## Approach

Widen `defineIntents` once rather than per plugin: an intent entry may carry an optional `tab` guard, a type predicate over the plugin's own tab payload, and the shared dispatcher runs it between the unknown-name check and the payload check, answering a failed guard with the same `invalid ${intent} payload` rejection the payload check already produces. Conversations then declares one table whose list entries (`create`, `open`, `delete`) guard for the `list` variant and whose conversation entries (`send`, `rename`, `select-model`, and the four payload-free forwards) guard for the `conversation` variant; `LIST_INTENTS`, `runListIntent`, `runIntent`, `runConversationIntent`, `EMPTY_INTENT_ACTIONS`, and every hand-written rejection string go away. The activation test pins the answers this must keep — including a conversation-tab intent raised from the list tab still answering `invalid rename payload` rather than an unknown intent — and `define-intents.test.ts` gains the widened shape's own cases. `isConversationsPayload` keeps failing as `reportFailure` for the authoritative payload, which the helper already does; `sql/intents.ts`, the largest existing table, compiles unchanged because the new member is optional.

## Implementation

1. In `src/plugins/define-intents.ts`, add the optional `tab` member to `TabPluginIntentEntry` as a type predicate (`tab?(tabPayload: Payload): tabPayload is TabPayload`) with the entry's `run` seeing the narrowed `TabPayload`, defaulting to `Payload` so a flat table's entries need no change. Run the guard in the returned callback between the unknown-name rejection and the payload rejection, answering with `invalid ${request.intent} payload`.
2. In `src/plugins/conversations/activate.ts`, replace the `intent` callback with `defineIntents('conversations', isConversationsPayload, intentTable(tabs))`, add the two tab-kind guards, and express the ten intents as one table: the list entries guard `isListTab`, the conversation entries guard `isConversationTab`, and the four payload-free forwards (`load-older`, `cancel`, `open-files`, `launch-shell`) share one factory that guards empty and forwards the matching topic action with the narrowed tab's conversation id.
3. Delete `runListIntent`, `runIntent`, `runConversationIntent`, `LIST_INTENTS`, and `EMPTY_INTENT_ACTIONS` from `activate.ts`.
4. Add cases to `src/plugins/define-intents.test.ts`: an entry whose `tab` guard fails is rejected with `invalid <intent> payload`; one whose guard passes runs, with `run` receiving the narrowed tab payload.
5. Run `./scripts/run.mjs check-diff` after the helper change, after the conversations rewrite, and after the tests.

## Tests

- `src/plugins/define-intents.test.ts` gains the two pre-check cases above, using a small union-shaped fixture payload so the narrowed `run` parameter is exercised.
- `src/plugins/conversations/activate.test.ts` must pass without edits: it already pins the malformed-payload rejections, the unknown-intent rejection for `consume-draft`, the cross-kind rejection (`rename` from the list tab answering `invalid rename payload`), the workspace-intent forwards, and the authoritative-payload failure. It is the proof the rejection vocabulary survived.

## Out of scope

- Widening the helper any further than the per-entry `tab` guard; a resolver that maps a tab payload to a table was the alternative and would answer a cross-kind intent with `unknown … intent`, which is not what the plugin answers today.
- The other eleven `defineIntents` callers, whose tables carry no `tab` member and compile unchanged.
- `EMPTY_INTENT_ACTIONS`' vocabulary as a named map; the four forwards become entries built by one factory.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A search for `rejectRequest` in `src/plugins/conversations/activate.ts` finds only the command path's `No conversation matching …` — no intent rejection is spelled out in the plugin anymore.
- The conversations activation suite passes unchanged, so every rejection string it pins is still the string the dispatcher answers.

## Documentation and specification impact

None. The plugin's user-visible behavior is unchanged; only which module spells the rejection changes. No spec, `help.md`, or user documentation describes the dispatcher.
