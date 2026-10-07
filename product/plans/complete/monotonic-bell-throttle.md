# Throttle bell sounds with a monotonic clock

**Complexity: 2/10** — one field and one comparison in a single client class, with colocated tests; no server, wire, or spec-level behavior change.

`NativeNotifications` measures its one-second bell interval with `Date.now()`. When the system clock steps backward, the elapsed value is negative until wall time catches up, so every sound is suppressed for the length of the step even though desktop banners still show.

## Design decisions

1. **Use `performance.now()` for the interval.** It is monotonic and unaffected by system time adjustments. It resets on page reload, as does the in-memory throttle, so the two stay consistent.
2. **Behavior is otherwise unchanged.** The interval stays one second per client, the throttle gates only the bell, and the desktop banner is delivered independently before the throttle is consulted.
3. **Read the clock once per attempt.** A single `performance.now()` value is compared and stored, so the check and the stamp cannot disagree.
4. **No spec or help change.** The notifications spec already states each client plays at most one bell per second while every eligible banner may show; that stays true, now regardless of clock adjustments. Neither `help.md` nor the user documentation describes the clock source.

## Implementation steps

1. In `web/src/notifications/native-notifications.ts`, replace both `Date.now()` calls in `show` with one `performance.now()` read stored in `now`.

## Tests

In `web/src/notifications/native-notifications.test.ts`, drive the monotonic clock with a mocked `performance.now` instead of `Date.now`:

- the existing throttle test advances the monotonic clock by one second to make the next sound eligible while banners keep showing;
- a regression moves wall time (`Date.now`) backward after the first sound, advances the monotonic clock one second, and checks the next sound plays;
- wall time moving forward alone does not release the throttle while the monotonic clock has advanced under one second, and the banner still shows.

## Out of scope

- Any change to banner delivery, permission, sound selection, or volume.
- The server-side notification throttle and other `Date.now()` uses.
