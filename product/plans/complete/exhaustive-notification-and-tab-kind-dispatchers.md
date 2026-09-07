# Drive the last two union dispatchers off the exhaustiveness idiom

**Complexity: 4/10** — two contained dispatchers, each already covered by tests, brought onto the `Record<Union, …>` idiom the rest of the codebase documents twice. No behavior a user can observe changes; the point is that the next member of either union cannot ship inert.

The project has an established, twice-documented way to make a union's dispatcher exhaustive — a `never`-typed default arm (`unhandledClientMethod`, `unhandledRemoteFrame`) paired with a membership table keyed by the union (`CLIENT_FRAME_TYPES`, `SERVER_FRAME_TYPES`, `CAPABILITIES`, `NOTIFICATION_TOPICS`). Two dispatchers predate it:

- **`shouldNotify` (`src/notifications.ts:47`)** splits sixteen `NotificationEventType` members across two switches. The first returns `true` for the eleven explicit events and ends `default: { break; }`; the second maps the five ambient events to config flags and ends `default: { return false; }`. A seventeenth member falls through both to `false`. `notificationText` in the same file is *already* exhaustive — no default, and its `string` return type makes a missing case a compile error — which is what makes the inconsistency visible inside one file.
- **`tabProblems` (`src/profile/schema.ts:95`)** checks `type` against `TAB_TYPES`, a `string[]` of eleven names mirroring the eleven arms of `ProfileTabFile` (`src/profile/types.ts:140`), and `PRESENTATION_TYPES`, a second hand-kept `Set` restating nine of them. Neither is tied to the union.

A new notification event compiles, ships, and never reaches the feed. A new profile tab kind compiles and is then rejected on load with `type must be one of …` for every profile that uses it. In both cases the build is green and the feature is simply inert.

## Goal

Adding a member to either union is a compile error until it is classified, and the two hand-kept lists that shadowed those unions are derived from them instead.

## Design decisions

**Two exhaustive tables, not a `never` guard, for `shouldNotify`.** The item proposes a shared `never`-typed default arm. Splitting the union into `AmbientNotificationEvent` (hand-declared, five members) and `ExplicitNotificationEvent` (`Exclude<NotificationEventType, AmbientNotificationEvent>`) and giving each an exhaustive table removes both switches — so there is no default arm left to guard. A seventeenth member joins `ExplicitNotificationEvent` automatically and breaks `EXPLICIT_EVENTS`'s `Record<ExplicitNotificationEvent, true>` annotation until it is listed; an ambient one must be added to `AmbientNotificationEvent` and then to `AMBIENT_EVENTS` as well. That is the same compile-time guarantee, in the idiom `CAPABILITIES` and `CLIENT_FRAME_TYPES` already use, and it turns the second switch into the lookup the item asks for.

**`AMBIENT_EVENTS` is keyed `Record<Ambient, keyof NotificationConfig['events']>`**, so an ambient event whose config toggle is renamed or missing is a compile error rather than a silent `undefined` read.

**A `never` guard *is* the right answer for `tabProblems`**, because that switch stays — each kind has its own checker. Narrowing `type` to `ProfileTabFile['type']` through a predicate lets the `default` arm be replaced by explicit `image`/`markdown` cases, after which the switch is exhaustive over the union and a twelfth kind fails to compile for want of a return.

**One table, one boolean, for the two profile lists.** `TAB_KINDS: Record<ProfileTabFile['type'], boolean>` — the boolean being whether the kind carries the flat presentation fields. `TAB_TYPES` becomes `Object.keys(TAB_KINDS)` and `PRESENTATION_TYPES` becomes a lookup on the same table.

**The error wording does not move.** `tabProblems` builds its message from the table's keys, and JavaScript preserves string-key insertion order, so declaring the eleven kinds in the current `TAB_TYPES` order keeps `type must be one of agent, harness, editor, …` byte-identical. `src/profile/validate.test.ts` and `src/profile/file.test.ts` pin that string and must pass untouched.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The documented idiom | `CLIENT_FRAME_TYPES` / `SERVER_FRAME_TYPES` (`src/remote/protocol.ts`), `CAPABILITIES` / `NOTIFICATION_TOPICS` (`src/plugins/api.ts`) |
| The `never`-typed guard | `unhandledClientMethod` (`src/client-message.ts`), `unhandledRemoteFrame` (`src/remote/frame-decode.ts`) |
| An already-exhaustive dispatcher in the same file | `notificationText`, `src/notifications.ts:98` |
| The config toggles the ambient table keys into | `NotificationConfig['events']`, `src/config.ts:11` |
| The union the profile lists shadow | `ProfileTabFile`, `src/profile/types.ts:140` |

## Implementation steps

1. **`src/notifications.ts`.** Declare `AmbientNotificationEvent` and `ExplicitNotificationEvent`; add `AMBIENT_EVENTS` (`Record<Ambient, keyof NotificationConfig['events']>`) and `EXPLICIT_EVENTS` (`Record<Explicit, true>`), each with the comment explaining that keying by the union makes an omission a compile error. Rewrite `shouldNotify` as: notifications-tab guard, then an ambient test, then either the explicit lookup or focus suppression plus the config lookup. Keep the existing prose about why the explicit events bypass focus suppression.

2. **`src/profile/schema.ts`.** Replace `TAB_TYPES` and `PRESENTATION_TYPES` with `TAB_KINDS`; derive `TAB_TYPES` from its keys for the message; add an `isTabKind` predicate; use `TAB_KINDS[type]` for the presentation check; give `image` and `markdown` their own case and delete the `default` arm.

## Tests

- **`src/notifications.test.ts`** — a case per union member driven off the tables, so a seventeenth event is covered without a new case being written. It has no case at all for `plugin-failure` today; the table-driven pass supplies one. Every existing case must keep passing.
- **`src/profile/validate.test.ts`, `src/profile/file.test.ts`** must pass **unchanged** — they exercise `collectProfileProblems` and pin the current messages, which is the check that the wording did not move.
- **`src/profile/schema.test.ts`** (or the closest existing home) — every `ProfileTabFile` kind is accepted by `tabProblems`, and the presentation-carrying kinds are exactly the nine the old `Set` listed, asserted against the table rather than restated.

## Out of scope

- **The remaining hand-written membership lists elsewhere.** The item names these two; sweeping every union in the codebase is a different piece of work.
- **Adding a notification event or a profile tab kind.**
- **`notificationText`**, which is already exhaustive.
- **The `DETAIL_MODES` set** in the same profile file: it shadows `FileNavigatorDetail`, not `ProfileTabFile`, and is a separate union.
