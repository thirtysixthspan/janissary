# System schedules 02: explicit schedule notification contract

**Complexity: 3/10**

This extends one existing event/config/delivery pipeline and adds message helpers. It does not own the startup or firing state machines that decide when to emit.

## Goal

Add the default-on, focus-independent `system-schedule-fire` event and its wording helpers before startup or the schedule owner needs to emit it. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependency: 01 for the shared reveal-on-focus behavior. Use the rebased startup baseline recorded there.
- One event type, `system-schedule-fire`, covers firing, missed run, missing script, and system-shell startup failure. Use the existing camelCase config convention: `notifications.events.systemScheduleFire`, default `true`. It is the only togglable explicit event. Existing ambient defaults and focus suppression stay intact.
- Messages are exactly `System schedule <name> ran: <command>`, `System schedule <name> missed its run at <time>; not run (app was closed).`, `System schedule <name> could not run: script "<file>" is missing.`, and `System shell could not start: <reason>.` The firing command is the stored `script <name>` invocation, not each expanded line or a claim that those lines completed.
- Attribute notices to label `system` and link with `{ openTab: 'system' }`. Notification storage already accepts labels with no current tab; startup failure must work before a system tab was created. Focus links reveal it when a managed tab exists. Failure does not manufacture a placeholder tab merely to carry a notice.
- Use existing explicit feed/toast/native delivery. Classify this event as warning for the single existing sound-category table. Per-line errors get no new event. An explicitly authored `notify` line and existing shell ambient/recording notices retain their ordinary behavior.

## Existing code to reuse

`src/notifications/index.ts` owns classification and `shouldNotify`; `format.ts`, `deliver.ts`, `queue.ts`, and `record.ts` own rendering and delivery. `src/config-decode.ts` merges missing keys with defaults. The current tab focus RPC and transcript link renderer already provide the reveal route after 01. The current feed queue is per-process; `.janissary/notifications.json` is an existing record, not a loader that replays old notices on restart. Newly detected missed runs must emit fresh events through this pipeline.

## File scope

- `src/config.ts`, `src/config-decode.ts`, `src/notifications/{index,format,sound-category}.ts`; new `src/schedule/system/notices.ts` with exact event messages and attribution. Anticipated extract: `src/notifications/event-types.ts` if adding classification exceeds the 200-line rule; migrate its importers directly, with no barrel shim.
- Tests: existing `src/config.test.ts`, `src/notifications/{index,format,native,queue,record}.test.ts`; new `src/schedule/system/notices.test.ts` and `src/notifications/system-schedule.integration.test.ts`; notification fixtures that construct `NotificationConfig` in those tests. Client fixture updates, if needed, belong in existing `web/src/notifications/{NotificationsTab.test.tsx,useNativeNotifications.test.tsx,native-notifications.test.ts}` and `web/src/shared/transcript/transcript-intents.test.ts`.
- Specs/docs: `product/specs/{notifications,application-config}.md`, `documentation/user-documentation/tab-types/notifications.md`.

## Ordered changes

1. Add the explicit event and default-on config key, including decoding old configs with missing `notifications`, missing `events`, missing key, malformed value, and explicit `false`.
2. Add the toggle check before ordinary explicit eligibility, without treating it as ambient. Keep the event out of the ambient map and in the exhaustive explicit/category maps.
3. Add narrowly scoped message helpers. Reuse notification formatting/timestamps rather than duplicating the feed or notification record.
4. Pin no-current-system-tab attribution and reveal links. Update specs to describe the one explicit-toggle exception and all four messages.

## Tests and verification

Test exact wording, punctuation normalization for startup reasons, default on, explicit off, active versus hidden tab, queue/record/toast/native eligibility, and unchanged ambient behavior. The scope E2E uses real controller notification delivery: emit the event, inspect the held record and broadcast, open the feed, follow its focus target through RPC, and confirm the hidden managed fixture is revealed. Run `./scripts/run.mjs check-diff`. Actual startup/firing event sources are exercised when 03 and 08 land; 13 verifies them in the browser.

## Boundaries

No schedule execution or storage, and no command-error notifications. This plan establishes the notification service contract; 03 and 08 own when notices are raised. No dependency or asset changes are needed.
