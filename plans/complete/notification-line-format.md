# Fix the notification line format (duplicated label + unfriendly timestamp)

**Complexity: 2/10** — a self-contained change to `src/notifications.ts` only: the timestamp formatter, the line composition in `notify()`, and one `notificationText` case. No rendering-component change, no protocol change, no new files. The shared message-line renderer and the cross-agent `msg`/`broadcast` path are deliberately untouched.

## Goal

A notification currently renders as:

```
● janus: 20:32:51 janus: this is a notification
```

It should render as:

```
● 8:32pm janus: this is a notification
```

Two defects: (1) the originating tab's label is shown **twice** — once as the colored-dot label and again inside the line text — and (2) the timestamp is an unfriendly 24-hour `HH:MM:SS` instead of a compact 12-hour clock.

## Approach

The feed renders each notification as a **message line** (`● {from}: {text}`, in `transcript-line.tsx`), where `notify()` sets `from` to the tab label and packs `"${timestamp} ${notificationText}"` into the text. For a `manual`/`notify` line, `notificationText` also begins with `${tabLabel}: `, so the label appears both as the dot label and inside the text — and because the timestamp is packed into the text (after the dot label), it reads `● janus: 20:32:51 …`.

The fix keeps using the message-line renderer (so the colored dot stays) but changes what `notify()` puts where, all within `notifications.ts`:

1. **`formatTimestamp`** — return a compact 12-hour clock: hour with no leading zero, two-digit minutes, lowercase `am`/`pm`, no seconds (`20:32 → 8:32pm`, `09:05 → 9:05am`, `00:15 → 12:15am`, `12:00 → 12:00pm`).
2. **`notify()`** — set the message line's `from` to the notification's provenance header `"${timestamp} ${tabLabel}"` (when + who), and set the line text to just the event body (`notificationText(...)`). The colored dot still comes from `fromColor`, which is still looked up from `tabLabel`, so the dot color is unchanged. This places the time first, then the label, then the message — matching the target — and removes the double render of the label.
3. **`notificationText`** — the `manual` case returns just the message body (`detail`), dropping its own `${tabLabel}: ` prefix, since the label now lives in the `from` header. The other (ambient) cases are unchanged. Export the function so the composition can be unit-tested.

Cross-agent `msg`/`broadcast` deliveries render through the same message-line component but are appended by a different code path (not `notify()`), so they are unaffected.

## Implementation steps

1. Rewrite `formatTimestamp` to the 12-hour `h:mmam/pm` form.
2. Change `notify()` to compose `from = "${timestamp} ${tabLabel}"` and `output = notificationText(...)`.
3. Change the `manual` case of `notificationText` to return `detail ?? ''`, and `export` the function.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests (`src/notifications.test.ts`)

- **`formatTimestamp`** — `20:32 → 8:32pm`, `09:05 → 9:05am`, `00:15 → 12:15am` (midnight hour), `12:00 → 12:00pm` (noon), `23:59 → 11:59pm`.
- **`notificationText`** — `manual` returns the bare message (no `label:` prefix); an ambient case (e.g. `state-change`) is unchanged (`Agent 'janus' finished`).
- **`notify()` composition** — with fake timers set to a known time and a stub `Managers` holding an open notifications tab plus an `append` spy, a `manual` notify appends an entry whose `from` is `"8:32pm janus"` and whose `output` is exactly the message (proving the label is not duplicated and the time leads).

## Out of scope

- The shared message-line renderer (`transcript-line.tsx`) and CSS — unchanged.
- Cross-agent `msg`/`broadcast` line formatting — a separate path, untouched.
- The wording of ambient event bodies (`Scheduled: … in <tab>`, etc.) beyond the `manual` de-duplication.
- Any change to which events fire or to focus-suppression rules.

## Verification

- `./scripts/run.mjs check-diff` passes (lint, typecheck, server tests).
- Manual: open `notifications`, run `notify this is a notification`, confirm the feed line reads `● 8:32pm janus: this is a notification` (12-hour time, single label). Not runnable headless here — covered by the `notify()` composition test.
