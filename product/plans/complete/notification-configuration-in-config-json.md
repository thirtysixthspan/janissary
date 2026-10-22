# Notification configuration in config.json

**Complexity: 4/10** — spans server and web through one loosened wire field, a new defaults table, a per-entry config decoder, a first-of-its-kind backfill write on config load, and a rewritten `emitNativeNotification`, with correctness hinging on catching every test literal and doc paragraph that names the removed mutes or the old classification.

Today every eligible notification gets the same treatment. A live explicit event raises a desktop banner when `osNotifications` is on, and it plays the one bundled cue its event is hard-wired to (`success`, `warning`, or `error`) when `terminalBell` is on. The only knobs are those two global switches plus a volume and a mute per cue. So a user can't say "beep for a question, but stay quiet for a failed file operation", or "give me a banner for `harness-idle` and nothing else". This feature adds a configuration in `.janissary/config.json` that controls, for each type of notification, whether a system notification or an audio sound is triggered when that type fires, and which kind.

## Design decisions

Established by the feature text:

- The configuration lives in `.janissary/config.json`.
- It is keyed by notification type. For each type it controls whether a system notification and an audio sound are triggered when that type fires, and what kind of each.

Settled with the user:

- **Each type gets two settings: a banner switch and a cue choice.** The banner is on or off. The sound is one of the three bundled cues (`success`, `warning`, `error`) or none, so a type can be moved to a different cue, not just silenced. There's no custom sound file; the cues stay the three bundled MP3s.
- **The banner is on or off, nothing more.** No sticky or persistent variant, because browsers and OS settings honour `requireInteraction` unevenly and the setting would mean different things on different machines.
- **Every notification type is configurable, ambient ones included.** The four ambient types (`state-change`, `schedule-fire`, `agent-start`, `rate-limited`) can now raise a banner and a cue, which they never could before. They default to no banner and no sound, so nothing changes unless the user opts in. An ambient type still has to pass its existing feed toggle under `notifications.events` and focus suppression before it can alert at all: an event that never reaches the feed never alerts. In practice an ambient alert is therefore always for a background tab whose toggle is on.
- **`osNotifications`, `terminalBell`, and the three per-cue volumes stay.** `osNotifications` and `terminalBell` remain master switches over every type, and the volume of whichever cue a type plays still comes from `terminalBellVolumeSuccess`, `terminalBellVolumeWarning`, or `terminalBellVolumeError`. A type set to `"desktop": true` shows no banner while `osNotifications` is `false`, and a type set to a cue plays nothing while `terminalBell` is `false`.
- **The three per-cue mute switches are removed.** `terminalBellMuteSuccess`, `terminalBellMuteWarning`, and `terminalBellMuteError` go away, because setting a type's sound to none covers what a mute did, and does it per type. This is a deliberate break: an existing config that set one of them no longer has that effect.
- **A removed mute key left in a config is ignored silently.** It stays in the file untouched and does nothing, like any other key the app doesn't read. No warning is printed.
- **The section is `notifications.alerts`, keyed by each type's own name.** It sits beside the existing `notifications.events` toggles. A key is the type exactly as the spec and the `.janissary/notifications.json` record spell it: `harness-idle`, `file-operation`, `state-change`, not the camelCase the `events` toggles use. That way the name a user greps out of the record file is the name they configure.
- **Each entry has two fields, `desktop` and `sound`.** `desktop` is a boolean. `sound` is one of the strings `"success"`, `"warning"`, `"error"`, or `"none"`. For example, `"question": { "desktop": true, "sound": "warning" }` and `"file-operation": { "desktop": false, "sound": "none" }`.
- **An explicit type with no entry behaves as it does today.** Its `desktop` defaults to `true` and its `sound` to the cue it plays now: `success` for `manual` and `plugin-note`, `warning` for the request and status-change types, `error` for the failures. The mapping is today's `CATEGORIES` table in `src/notifications/sound-category.ts`, copied unchanged. A config with no `alerts` section therefore alerts exactly as before, except that a stale mute key no longer silences anything. An ambient type with no entry defaults to `desktop: false` and `sound: "none"`.
- **A fresh config writes every type out.** When Janissary creates `.janissary/config.json` on first launch, the file lists all 29 types under `notifications.alerts` with their defaults, the same way every other setting appears in a fresh file, so the file itself shows what can be configured. The types are listed in alphabetical order so a reader can find one.
- **An existing config missing the field gets it written in.** When `loadConfig` reads an existing `config.json` and the notifications alerts field does not exist, it is created with the defaults and added to the file, so a user upgrading finds every type listed in their own file instead of getting the defaults only by omission. This is the first setting whose missing default is persisted on load; every other setting still fills its default in memory only. The write starts from the file's own parsed contents, keeps every key already there (stale `terminalBellMute*` keys and hand-added keys included), and replaces the file atomically. Like the `theme` and `syntax theme` writes, it re-serialises the whole file at two-space indentation. A file that isn't valid JSON is still left untouched and nothing is written.
- **A missing `notifications` object counts as missing too.** When the file has no `notifications` at all, it gains one holding both the `events` toggle defaults and the full `alerts` map, so the file shows both. A `notifications` object that's already there keeps its `events` exactly as written; only `alerts` is added or filled inside it.
- **Missing types are written into a present map.** When `alerts` exists but lacks some types, such as a type added in a later release, each absent type is added with its default. An entry already there is never touched, even a malformed one; it still decodes field by field. So a new event type appears in every user's file on the first launch after an upgrade.
- **A non-object value is replaced.** When `notifications` or `alerts` is present but isn't a JSON object (`null`, `"off"`, an array), it's treated as missing and replaced on disk by the full defaults: a bad `notifications` becomes `events` and `alerts` defaults, a bad `alerts` becomes the full map with the `events` beside it kept.
- **A failed write is silent.** If the file can't be written (a read-only checkout, no permission), the defaults still apply in memory and startup carries on. Nothing is printed, matching the notification record's silent write failures, so a read-only checkout doesn't warn on every launch. The next launch simply tries again.
- **A file with nothing to add is never written.** When every type is already present under an object `alerts` inside an object `notifications`, the file is left byte-for-byte as it was.
- **Entries decode field by field, silently.** A key that isn't a known type is ignored, and so is an entry that isn't an object. Each field falls back to that type's own default on its own. So `{ "sound": "none" }` keeps the type's default banner, and `"sound": "loud"` keeps the default cue while a valid `desktop` beside it still applies. A missing or malformed `notifications` or `alerts` object yields every default. Nothing is warned, which matches how every other setting decodes.

Decided while verifying the plan against the code:

- **A banner with no sound sends no cue name.** A type set to `{ "desktop": true, "sound": "none" }` has no cue at all, so `category` on the wire becomes optional: it is present exactly when a cue will play, and `volume` is `0` whenever it's absent. Sending some placeholder cue at volume `0` was rejected because the field would then name a sound that was never chosen. The client does not create audio or advance its one-second bell throttle for such a banner.
- **One defaults table, keyed by the whole event union.** The defaults live in one `Record<NotificationEventType, …>` table, so a new event type stops compiling until it has a default, the same guard `EXPLICIT_EVENTS` gives in `src/notifications/index.ts` ("Keyed by the union so an eighteenth event stops compiling here"). It replaces `CATEGORIES` rather than sitting beside it, so the event-to-cue mapping keeps a single definition.

Established by existing behavior:

- A notification reaches the desktop banner and the bell through one place: `emitNativeNotification` in `src/notifications/deliver.ts`, called from `deliverNotification` after the notification is queued and recorded (`if (!replayed) emitNativeNotification(notification);`). It runs for live notifications only. A replayed notification never alerts, and neither does anything `shouldNotify` already discarded.
- Only explicit events alert today. `soundCategory` in `src/notifications/sound-category.ts` maps every explicit event to a cue and maps the four ambient events to nothing, and `emitNativeNotification` returns early on that nothing (`if (!category) return;`), so ambient events never raise a banner or a sound even with their feed toggle on.
- The server owns the decision and the client does not mirror config. The server sends one `native-notification` event per alert carrying the tab, display name, message, `category`, a `desktop` flag, and an effective `volume` (`NativeNotificationEvent` in `src/protocol/events.ts`). The client plays `/sounds/<category>.mp3` at that volume and shows a banner when `desktop` is true and the browser has already granted permission.
- Each client suppresses both channels when its window has focus and the originating tab is visible there, and plays at most one bell per second across all types (`web/src/notifications/native-notifications.ts`, `if (event.volume <= 0 || now - this.lastBell < 1000) return;`).
- The bundled cues are `web/public/sounds/success.mp3`, `warning.mp3`, and `error.mp3`. Replacing one means rebuilding the web bundle.
- Config is decoded setting by setting in `src/config-decode.ts`. A wrong-typed value falls back to its own default without discarding valid neighbours, and an older or partial config is never rewritten (this feature adds the one exception, the alerts backfill above). Config is read once at startup (`loadConfig(cwd)` in `src/main.ts`), so a change takes effect on the next run.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The single point where a notification becomes a banner and a sound | `emitNativeNotification` | `src/notifications/deliver.ts` |
| Today's event-to-cue mapping, to copy into the defaults table | `CATEGORIES` | `src/notifications/sound-category.ts` |
| The event type union, and the "keyed by the union" exhaustiveness pattern | `NotificationEventType`, `EXPLICIT_EVENTS`, `AMBIENT_EVENTS` | `src/notifications/index.ts` |
| Wire event that already carries per-alert desktop flag, cue, and volume | `NativeNotificationEvent` | `src/protocol/events.ts` |
| Bus and sink shapes derived from that wire event | `NotificationsEvent`, `Sinks.sendNativeNotification` | `src/bus.ts`, `src/controller/types.ts` |
| Client banner and audio playback, focus suppression, bell throttle | `NativeNotifications` | `web/src/notifications/native-notifications.ts` |
| Global switches and per-cue volume | `osNotifications`, `terminalBell`, `terminalBellVolume*` | `src/config.ts` |
| Per-setting decoding with individual fallback, and the nested `notifications` decoder to extend | `decodeConfig`, `notifications()`, `booleanValue`, `isRecord` | `src/config-decode.ts`, `src/value-guards.ts` |
| Per-entry decoding that drops one bad entry and keeps the rest | `settingsMap` | `src/config-decode.ts` |
| First-launch write of the whole default config | `loadConfig` | `src/config.ts` |
| Closest completed plan | OS notifications and terminal bell | `product/plans/complete/os-notifications-and-terminal-bell.md` |

## Proposed changes

Land everything below as one change. Removing the mute fields and the `soundCategory` export breaks `src/notifications/native.test.ts` and `src/config.test.ts` until they are updated, so there is no green checkpoint halfway.

### Defaults table (`src/notifications/alert-defaults.ts`, replacing `src/notifications/sound-category.ts`)

A new module exports the `AlertSound` type (the wire's cue names, `NonNullable<NativeNotificationEvent['category']>`, plus `'none'`, so the three cue names keep one definition), the `NotificationAlert` type (`{ desktop: boolean; sound: AlertSound }`), and `NOTIFICATION_ALERT_DEFAULTS`, a `Record<NotificationEventType, NotificationAlert>`. The 25 explicit types carry `desktop: true` and the cue from `CATEGORIES` in `src/notifications/sound-category.ts`, unchanged. The four ambient types carry `desktop: false` and `sound: 'none'`. Write the entries in alphabetical order of type name, because this literal's insertion order is the order a fresh `config.json` lists them in.

The module imports `NotificationEventType` and `NativeNotificationEvent` with `import type` and imports nothing at runtime. That matters: `src/config.ts` imports this table at runtime, and `src/notifications/index.ts` imports `getConfig` from `src/config.ts`, so a runtime import of `./index.js` here would create a cycle that `DEFAULT_CONFIG`'s top-level construction could trip over.

Delete `src/notifications/sound-category.ts`. Its only consumers are `src/notifications/deliver.ts` and `src/notifications/native.test.ts`, both rewritten below.

### Config (`src/config.ts`, `src/config-decode.ts`)

- `NotificationConfig` in `src/config.ts` gains a required `alerts: Record<NotificationEventType, NotificationAlert>`, both types imported with `import type`. `DEFAULT_CONFIG.notifications.alerts` is `NOTIFICATION_ALERT_DEFAULTS`, so the first-launch write in `loadConfig` (`atomicWriteFile(configPath, JSON.stringify(DEFAULT_CONFIG, undefined, 2) + '\n')`) lists every type. At two-space indentation each entry spans four lines, so a fresh file grows by about 120 lines. That's the accepted cost of writing every type out.
- Remove `terminalBellMuteSuccess`, `terminalBellMuteWarning`, and `terminalBellMuteError` from `Config`, from `DEFAULT_CONFIG`, and from `decodeConfig` in `src/config-decode.ts`. A stale key in a user's file then has no decoded field to land in, which is the "ignored silently" behavior with no extra code.
- `notifications()` in `src/config-decode.ts` also decodes `record.alerts`. Walk the keys of `fallback.alerts`, never the raw object's keys: that is what drops an unknown type name without a separate check. For each type, use the raw entry only when `isRecord` accepts it, then decode `desktop` with the existing `booleanValue` and `sound` with a new small helper beside it that accepts only the four `AlertSound` strings, each against that type's own default.
- `updateConfig`'s own behavior doesn't change. At runtime it's only ever called with `syntaxTheme`, `theme`, and `pluginSettings` (`src/commands/syntax.ts`, `src/commands/theme.ts`, `src/plugins/settings.ts`), so it never rewrites a user's `notifications` object.
- `loadConfig`'s existing-file branch, after `decodeConfig` succeeds, works out what the parsed raw object is missing: no `notifications` object (absent or failing `isRecord`, which rejects `null` and arrays) means `events` and `alerts` defaults; an object `notifications` with no object `alerts` means the full `alerts` map; an object `alerts` means only the types absent from its own keys (`Object.hasOwn`), with present entries copied as written. Put that pure computation in its own small function in `src/config-decode.ts` beside `notifications()` (it returns the raw object to write, or nothing when there's nothing to add), so it's testable without a file and `src/config.ts` stays a loader. When it returns something, `loadConfig` writes it through the same `atomicWriteFile(configPath, JSON.stringify(…, undefined, 2) + '\n')` call the fresh-file branch already makes. No helper is shared with `updateConfig`: its shallow `{ ...raw, ...partial }` merge would replace the user's whole `notifications` object, and its `Partial<Config>` argument can't carry raw, possibly invalid toggles. The merge here is nested: `alerts` is added inside the user's existing `notifications` object, so their `events` toggles stay exactly as written, `systemScheduleFire: 'yes'` included.
- Keep that write outside the `try` that catches `JSON.parse`. Inside it, a failed write would land in the existing catch, print the invalid-JSON warning, and replace a perfectly good decoded config with `DEFAULT_CONFIG`. Wrap the write in its own `try` with an empty catch: a failed write is silent and never changes what was decoded. `atomicWriteFile` already preserves the file's permissions (pinned by "preserves restrictive permissions on an existing config file"). The remote host's own `loadConfig(root)` in `src/remote/serve-root-settle.ts` gets the same backfill, since it's the same function.

### Server delivery (`src/notifications/deliver.ts`)

Rewrite `emitNativeNotification`:

- Read the type's entry as `config.notifications?.alerts[notification.event]`, falling back to `NOTIFICATION_ALERT_DEFAULTS[notification.event]` when `notifications` is absent. `RecordedNotification.event` is already typed `NotificationEventType` (`src/notifications/queue.ts`), so the index needs no cast.
- The banner flag is true only when `osNotifications` and the entry's `desktop` are both true.
- A cue plays when `terminalBell` is on and the entry's `sound` isn't `'none'`. Its volume is the matching `terminalBellVolumeSuccess`, `terminalBellVolumeWarning`, or `terminalBellVolumeError`. Otherwise the volume is `0`.
- Emit nothing when the banner flag is false and the volume is `0`, as the existing early return does.
- Otherwise emit the same `native-notification` bus event, adding `category` only when the volume is above `0`, the way `deliverNotification` adds `color` only when there is one (`...(notification.color && { color: notification.color })`).
- Drop the `if (!category) return;` exit, since ambient types can now alert. Nothing else gates them here: they only reach this function after `shouldNotify` has applied their feed toggle and focus suppression.

### Wire (`src/protocol/events.ts`)

`NativeNotificationEvent.category` becomes optional. Change the type in place; `src/bus.ts` (`Omit<NativeNotificationEvent, 't'>`) and `src/controller/types.ts` derive from it and need no edit. `wireControllerEvents` in `src/controller/events.ts` already copies `category: event.category` through, which works for an optional field because `strict` has no `exactOptionalPropertyTypes` here and `JSON.stringify` drops an `undefined` property from the broadcast.

### Client (`web/src/notifications/native-notifications.ts`)

The early return before audio playback also returns when `category` is absent, alongside the existing `event.volume <= 0` check, so the throttle clock isn't advanced for a banner-only alert. Banner delivery, suppression, the throttle, and disposal are unchanged.

### Specs

- `product/specs/notifications.md` § Desktop alerts and bell sounds: replace "The four optional ambient events … do not raise a desktop alert or bell, even if their feed toggle is on." with the `notifications.alerts` rule, ambient types off by default and still gated by their feed toggle. Reword "The bell uses bundled MP3 files: `success.mp3` for …" as the default cue per type, overridable per type. Remove the per-category mute sentence ("each category also has its own mute setting (default false)") and state that `osNotifications` and `terminalBell` gate every type's configured banner and cue. Add that a banner-only alert carries no cue.
- `product/specs/notifications.md` § System schedule notices: "is warning-classified" becomes "defaults to the warning cue".
- `product/specs/application-config.md`: delete the `terminalBellMuteSuccess`, `terminalBellMuteWarning`, `terminalBellMuteError` row; add a `notifications.alerts` row (type `object`, default every type with today's banner and cue, ambient off) describing the two fields and the four `sound` strings; update the `osNotifications` and `terminalBell` rows to say they gate each type's configured banner and cue; extend the decoding paragraph with the field-by-field rule, the dropped unknown type names, and the silently ignored removed mute keys. Its sentence "Loading an older or partial config does not rewrite the file." gains the one exception: a missing or non-object `notifications` or `alerts`, and any type missing from `alerts`, is written in with its defaults, keeping every other key and every entry already present; a file with nothing missing is not rewritten, and a failed write is silent.

### User docs

- `documentation/user-documentation/getting-started/configuration.md`: delete the three `terminalBellMute*` rows, add a `notifications.alerts` row linking to the notifications page, and add sentences to "Editing and validation" saying an invalid `desktop` or `sound` falls back to that type's default while the other field still applies, and that Janissary adds the alerts list to a config file that doesn't have one the next time it starts.
- `documentation/user-documentation/tab-types/notifications.md` § Desktop banners and bell sounds: delete the three mute rows and the "A category mute affects only its sound" paragraph; replace "they do not trigger desktop banners or bell sounds" with the opt-in; add a short `notifications.alerts` JSON example (a `question` moved to the `error` cue, a `file-operation` silenced, a `state-change` given a banner) and say that the config file itself lists every type with its default. There's no table of the 29 types: the file already shows them, and a table would go stale with the next event type. In § System schedule notices, "These notices use the warning banner and bell category" becomes "These notices default to a banner and the warning cue".

## Tests

- `src/config.test.ts`:
  - Drop the mute assertions from "defaults native alerts and validates per-category bell settings", and assert instead that a file setting `terminalBellMuteError: true` decodes to a config with no such property.
  - "writes a default notifications block with system schedule notices on" and "fills omitted and invalid notification toggles from defaults without discarding valid neighbors" compare the whole `notifications` object with `toEqual`. Narrow both to `notifications?.events` so they keep testing what their names say.
  - "fills omitted and invalid notification toggles from defaults without discarding valid neighbors" and "defaults system schedule notices on for missing or malformed settings" end by asserting the file is byte-for-byte unchanged. Those files lack `alerts`, so they are now backfilled. In the first, assert the file's `events` object is exactly what was written (`systemScheduleFire: 'yes'` included) and that `alerts` was added. In the `it.each`, assert per case: `{}` and `{ notifications: null }` gain `notifications` with both `events` and `alerts` defaults; `{ notifications: { events: null } }` keeps `events: null` and gains `alerts`; `{ notifications: { events: { stateChange: true } } }` keeps that `events` object and gains `alerts`.
  - New, on disk: a fresh file's `notifications.alerts` equals `NOTIFICATION_ALERT_DEFAULTS` and lists its keys in alphabetical order; an existing file without `alerts` gains the full map, keeping its other keys, an unknown hand-added key, and a stale `terminalBellMuteError`; `alerts: "off"` is replaced by the full map; an `alerts` map missing two types gains exactly those two, with a malformed entry beside them left as written; a file already holding every type is left byte-for-byte untouched; an invalid-JSON file is still left untouched; a failed write leaves the decoded config intact and prints nothing to stderr. Make the write fail by turning the `.janissary/` directory read-only with the `chmodSync` this file already imports, and restore its mode before the `afterEach` removes the temp directory.
  - New, decoding: a valid entry is honored; an unknown type name and a non-object entry are dropped; `{ "sound": "none" }` keeps the type's default `desktop`; `"sound": "loud"` falls back while a valid `desktop` beside it applies.
- `src/notifications/native.test.ts`:
  - Replace the mute half of "respects both master switches and category volume and mute" with alert-driven cases: `file-operation` set to `{ desktop: false, sound: 'none' }` emits nothing while the notification still reaches the queue; `question` set to `{ desktop: true, sound: 'error' }` emits `category: 'error'` at the error volume; `osNotifications: false` suppresses a `desktop: true` entry, and `terminalBell: false` suppresses a configured cue.
  - Ambient: with the default config, `state-change` from a background tab with its toggle on emits nothing; with an entry `{ desktop: true, sound: 'success' }` it emits; with `{ desktop: true, sound: 'none' }` it emits `desktop: true`, `volume: 0`, and no `category`. A replayed `auto-approve` still emits nothing even when its entry is configured.
  - Direct regression cases pin the separation between queueing and native-alert delivery: with `osNotifications` off, an opted-in banner stays silent while the notification remains queued; with an ambient feed toggle on and its alert entry left at defaults, the event remains queued without a native alert. The separately configured ambient alert case covers the opt-in path.
  - Replace "classifies every explicit event and no ambient event" with a check on `NOTIFICATION_ALERT_DEFAULTS`: every key of `EXPLICIT_EVENTS` has `desktop: true` and a cue other than `none`, every key of `AMBIENT_EVENTS` has `desktop: false` and `none`, plus the existing spot checks (`plugin-failure` error, `harness-idle` warning, `system-schedule-fire` warning, `manual` success).
- `src/notifications/index.test.ts`: the `allOn` and `allOff` literals are typed `NotificationConfig` and gain `alerts: NOTIFICATION_ALERT_DEFAULTS`.
- `src/notifications/system-schedule.integration.test.ts`: the `updateConfig({ notifications: { events: … } })` call in "does not queue, record, toast, or alert when the system schedule toggle is disabled" spreads the loaded `notifications` first, so it still type-checks with `alerts` required.
- `web/src/notifications/native-notifications.test.ts`: an event with no `category` and `volume: 0` shows its banner and creates no `Audio`, and a following event inside the same second still plays its cue, which proves the banner-only alert didn't consume the throttle.

## Out of scope

- No new notification event types and no new detection. The configuration governs events that already fire.
- No custom sound files. A type picks one of the three bundled cues or none.
- No sticky or persistent banner variant.
- No runtime command. The user edits `.janissary/config.json` and restarts, as with `syncPaths` and the existing bell settings.
- No per-type volume. Volume stays per cue.
- No control over the in-app toast, the feed, or the record file. The `alerts` map governs the desktop banner and the sound only; which events reach the feed is still decided by `notifications.events` and focus suppression.
- No per-tab settings. An entry applies to its type in every tab.
- Suppressing a native banner or sound does not suppress the notification queue, feed, record, or toast.

## Verification

- `$janissary/scripts/run.mjs check-diff`, which goes green once the whole change is in (see the note at the top of Proposed changes).
- Direct regression coverage confirms that disabling the desktop master or leaving an opted-in ambient event at its default alert settings suppresses native delivery while preserving queue delivery.
- Manual, fresh file: launch against an empty scratch directory and confirm `.janissary/config.json` lists all 29 types under `notifications.alerts`, alphabetically, with today's cues and the four ambient types off.
- Manual, upgrade: delete `alerts` from that file, leave a hand-added key and a changed `notifications.events` toggle in it, restart, and confirm `alerts` is back with every default while the hand-added key and the toggle are untouched.
- Manual, per-type treatment: grant the browser notification permission, put the Janissary window behind another app, and run `notify hello` from a tab. Confirm a banner and the success cue. Set `"manual": { "desktop": false, "sound": "warning" }`, restart, run it again, and confirm there is no banner and the warning cue plays. Set it to `{ "desktop": true, "sound": "none" }`, restart, and confirm a silent banner. In every case the feed line and toast appear as before.
- Manual, ambient opt-in: set `notifications.events.stateChange` to `true` and `"state-change": { "desktop": true, "sound": "success" }`, restart, run an `acp` prompt in a background tab, and confirm a banner and cue when its turn ends.
- Manual, removed mute: add `"terminalBellMuteSuccess": true` to the file, restart, run `notify hello`, and confirm the success cue still plays and nothing is printed about the key.
