# Move the PDF, video, and audio plugins onto the declared intent table

## Complexity

3/10 — three plugin `intent` callbacks rewritten as `defineIntents` tables with no change to their replies, plus a one-line hardening of the helper's lookup that the migration makes load-bearing; every existing reply is already pinned by the plugins' own suites.

## Goal

`defineIntents` in `src/plugins/define-intents.ts` makes the tab-payload guard, the unknown-intent rejection, and the per-intent payload check part of the plugin contract, but only the image plugin uses it. The PDF, video, and audio plugins still hand-roll the same three checks in nested `if` chains that restate the rejection wording, so each new intent added to one of them is one forgotten payload check away from handing unvalidated client input to a file write or a playlist mutation. Move those three plugins onto the table so their validation comes from the one audited helper.

## Approach

Replace each hand-written `intent` callback with `defineIntents('<id>', is<Id>Payload, { … })`, imported from `../api.js` like the image plugin does. Each branch of the old `if` chain becomes one table entry whose `payload` is the guard the branch already checked and whose `run` is the branch body:

- `src/plugins/pdf/activate.ts`: `load-failed` with `isLoadFailedPayload`, notifying the user with `failureLine` and answering `null`.
- `src/plugins/video/activate.ts`: `capture-frame` with `isCaptureFramePayload`, answering `{ name }` from `saveVideoShot`; `open-external` with `isEmptyPayload`, handing the file to `openExternal` and answering `null`.
- `src/plugins/audio/activate.ts`: `select-track` with `isSelectTrackPayload` and `remove-track` with `isRemoveTrackPayload`, keeping the `names no queued track` rejections, the unplayable-drop notification, and the `push` into the plugin's playlist record inside each `run`.

The helper produces exactly the messages the plugins already send (`invalid <id> tab payload` as a failure, `unknown <id> intent "<name>"` and `invalid <intent> payload` as rejections), and it checks them in the same order the hand-written callbacks do, so no reply changes.

### Helper lookup hardening

The hand-written chains compare `request.intent` against string literals, so a client naming an intent such as `toString` or `constructor` gets the ordinary `unknown … intent` rejection. The helper instead indexes a plain object literal, where those names resolve to `Object.prototype` members rather than `undefined`; calling the missing `payload` guard then throws, and a throw across the guarded boundary disables the plugin. Moving three more plugins onto the table would turn that latent gap into a regression for each of them, so the lookup changes to accept only the table's own keys (`Object.hasOwn`). An inherited name is then rejected as unknown, which is what every migrated plugin answers today.

## Implementation

1. Harden the lookup in `src/plugins/define-intents.ts` to own keys only, and add a case to `src/plugins/define-intents.test.ts` pinning that an inherited name is rejected as unknown.
2. Migrate `src/plugins/pdf/activate.ts`.
3. Migrate `src/plugins/video/activate.ts`.
4. Migrate `src/plugins/audio/activate.ts`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/plugins/define-intents.test.ts`: one new case — an intent named after an `Object.prototype` member (`toString`) is rejected with `unknown fixture intent "toString"` rather than throwing a `TypeError`.
- `src/plugins/pdf/activate.test.ts`, `src/plugins/video/activate.test.ts`, and `src/plugins/audio/activate.test.ts` pin the current replies, including the rejection and failure strings, and must pass unchanged — that is the check the migration is behavior-preserving.

## Spec

`product/specs/tab-plugins.md` ("Intents and resources") gains a paragraph naming the plugins that declare their intents as one table, the three checks it applies with their exact messages, and that an intent name is matched against the table's own entries only, so an inherited object property name is answered as an unknown intent.

## Out of scope

- Migrating `page`, `markdown`, `schedules`, `sessions`, and `conversations` (follow-up increment, noted in the PR).
- Any change to rejection or failure wording.
- Widening or versioning the plugin API (`TAB_PLUGIN_API_VERSION` does not move).
