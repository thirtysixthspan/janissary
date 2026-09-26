# Move the page, markdown, schedules, and sessions plugins onto the declared intent table

## Complexity

3/10 — four plugin `intent` callbacks rewritten as `defineIntents` tables with no change to their replies; every existing reply is already pinned by the plugins' own suites, and the helper itself is unchanged.

## Goal

`defineIntents` in `src/plugins/define-intents.ts` makes the tab-payload guard, the unknown-intent rejection, and the per-intent payload check part of the plugin contract, but only the image, PDF, video, and audio plugins use it. The page, markdown, schedules, and sessions plugins still hand-roll the same three checks in their own `switch` or `if` chains that restate the rejection wording by hand, so each new intent added to one of them is one forgotten guard call away from handing an unvalidated client payload to a `topicAction` that cancels a schedule or terminates a remote session. Move those four plugins onto the table so their validation comes from the one audited helper.

## Approach

Replace each hand-written `intent` callback with `defineIntents('<id>', is<Id>Payload, { … })`, imported from `../api.js` like the media plugins do. Each branch of the old chain becomes one table entry whose `payload` is the guard the branch already checked and whose `run` is the branch body:

- `src/plugins/page/activate.ts`: `navigate` with `isNavigateIntent`, calling the existing `navigate` helper and answering `null`; `sync` with `isSyncIntent`, navigating then calling `snapshotTab` under the key the tab ends up with, answering `null`. `runIntent` is deleted. The comments explaining why an unviewable address is a domain outcome and why the address moves before the snapshot stay beside their entries.
- `src/plugins/markdown/activate.ts`: `defineIntents('markdown', isMarkdownPayload, {})`. An empty table yields exactly the current `unknown markdown intent "<name>"` rejection and `invalid markdown tab payload` failure. The comment explaining why the view answers nothing stays.
- `src/plugins/schedules/activate.ts`: `clear` (`isEmptyIntent`), `cancel` (`isCancelIntent`), and `focus-owner` (`isFocusOwnerIntent`), each forwarding its current `topicAction` and answering `null`. `runIntent` is deleted.
- `src/plugins/sessions/activate.ts`: `refresh` (`isEmptyIntent`) plus one entry per row verb, built by a small `rowEntry(intent)` factory whose guard is `isSessionIntent` and whose `run` looks the row up (`no session row "<id>"`) and calls the existing `actOnRow`. The row verbs are listed once, as a `ROW_VERBS` tuple the table is built from, and `RowIntent` derives from it. `runIntent`, `isRowIntent`, and the `ROW_INTENTS` object are deleted; nothing else reads them. The row check itself (the row must offer the verb, and a session verb needs a recorded session) stays hand-written in `actOnRow`.

The helper checks in the same order the hand-written callbacks do (tab payload, then intent name, then intent payload) and with the same wording (`invalid <id> tab payload` as a failure, `unknown <id> intent "<name>"` and `invalid <intent> payload` as rejections), so no reply changes. An intent named after an inherited object property such as `toString` is already answered as unknown by all four plugins (the `switch` defaults and `isRowIntent`'s `Object.hasOwn`), and the helper's own-key lookup keeps that.

### Rejected alternative

Folding `conversations` into this increment. Its intents split by tab kind (list versus conversation tab) and today reject a wrong-kind intent as `invalid <intent> payload`; a single flat table cannot express that without a wording change, so it stays hand-written.

## Implementation

1. Migrate `src/plugins/page/activate.ts`.
2. Migrate `src/plugins/markdown/activate.ts`.
3. Migrate `src/plugins/schedules/activate.ts`.
4. Migrate `src/plugins/sessions/activate.ts`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

The existing suites pin every current reply, including the rejection and failure strings, and must pass unchanged. New cases pin the table's behavior on each plugin:

- `src/plugins/page/activate.test.ts`: an inherited name (`toString`) is rejected as `unknown page intent "toString"`.
- `src/plugins/markdown/activate.test.ts`: the rejection carries the exact `unknown markdown intent "reload"` wording, and `toString` is rejected as unknown rather than crashing.
- `src/plugins/schedules/activate.test.ts`: `toString` is rejected as `unknown schedules intent "toString"` with no topic action.
- `src/plugins/sessions/activate.test.ts`: `toString` is rejected as `unknown sessions intent "toString"`, and a malformed row payload for each row verb is rejected with its exact `invalid <verb> payload` wording.

## Spec

`product/specs/tab-plugins.md` ("Intents and resources"): the paragraph naming the plugins that declare their intents as one table gains page, markdown, schedules, and sessions, and notes that the conversations plugin still checks its own intents because they differ by tab kind.

## Out of scope

- Migrating `conversations`.
- Any change to rejection or failure wording, or to `defineIntents` itself.
- Widening or versioning the plugin API (`TAB_PLUGIN_API_VERSION` does not move).
