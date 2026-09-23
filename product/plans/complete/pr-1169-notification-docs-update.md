# Update the user documentation for notification toasts, the queue, and the record

**Complexity: 2/10** — prose-only rewrites of already-existing documentation pages, taking
normative wording straight from `product/specs/notifications.md`. No code, test, or spec changes.

Four documentation pages still teach the retired behavior — a notification with no feed open opens
the feed itself in the right sidebar, closing and reopening starts the feed over empty, nothing
earlier is filled in, and diagnostics open the feed when it is down — and never mention toasts,
burst escalation, `notifications clear`, or the `.janissary/notifications.json` record:

- `documentation/user-documentation/tab-types/notifications.md`
- `documentation/user-documentation/command-bar/commands.md`
- `documentation/user-documentation/tab-types/opening-files.md`
- `documentation/developer-documentation/tab-plugins.md`

## Goal

Each page's claims match `product/specs/notifications.md`: toasts (upper-right corner, 4 seconds
visible, 2-second fade, hover holds it, clicking reveals the feed docked), burst escalation on the
third notification within ten seconds, the queue's retention of history across close/reopen, the
record file's one-JSON-line-per-notification shape and `notifications clear`'s truncation of it.
No code, test, or behavior changes.

## Approach

Rewrite the specific sentences the backlog entry names, taking normative wording from the spec's
"Toasts and escalation" (`product/specs/notifications.md` lines 187-224), "The notification queue"
(lines 24-34), and "The notification record" (lines 36-52) sections — not paraphrased from memory.
Every other sentence on each page stays as written.

## Implementation steps

1. `documentation/user-documentation/tab-types/notifications.md`:
   - Replace "There is only ever one notifications tab. The feed has no command line. Closing it
     and reopening it starts over with an empty feed." — drop the "starts over with an empty feed"
     claim; add that the queue holds up to 200 notifications for the run and a feed opened later is
     seeded from it, so closing and reopening loses nothing.
   - Replace the "You don't have to open it first. If something happens with the feed closed, it
     opens itself in the right sidebar..." paragraph with the toast behavior: a notification with no
     feed on screen appears as a toast in the window's upper-right corner for 4 seconds before a
     2-second fade, hovering holds it, and clicking it docks the feed into the right sidebar (or
     wherever it's already docked) holding that line, without moving the tab you're in.
   - Replace "Nothing that happened earlier is filled in. The feed starts empty and collects what
     follows." with a description of the queue: it holds every notification of the run (200 most
     recent), so a feed opened at any point renders everything the queue still has.
   - Add a description of burst escalation: three notifications inside ten seconds make the feed
     visible on its own — docked right if it doesn't exist, docked (not focused) if it exists
     hidden, left alone if already docked — clearing every toast at once.
   - Add a description of the `.janissary/notifications.json` record: one JSON line per
     notification, persisting across runs, and `notifications clear` truncates it (see the `notify`
     section below for the command).
   - In "Post your own line with `notify`", replace "If the feed is closed, it opens in the right
     sidebar to receive the message." with: it lands in the queue and, when no feed is on screen,
     appears as a toast, the same as any other notification.
   - In "Read diagnostic messages", replace "...and they open the feed if it isn't already up."
     with: they land in the queue and toast the same way other notifications do.
   - Add `notifications clear` to the command summary block at the top and document it: empties the
     queue, truncates the record file, and clears any toasts on screen without opening or moving the
     feed; `notifications right clear` docks right and clears nothing, since the command reads a
     single keyword.

2. `documentation/user-documentation/command-bar/commands.md`:
   - Add a `notifications clear` row to the table alongside the existing `notifications [left|right]`
     row (line 17).
   - In the `## notifications and notify` section (line 60), replace "A notification with no feed
     open opens one in the right sidebar." with a one-sentence toast/escalation summary: it toasts
     in the corner instead, escalating to a docked feed after a burst of three within ten seconds.

3. `documentation/user-documentation/tab-types/opening-files.md` (line 95): replace "If the feed
   isn't open, it opens itself in the right sidebar to show you." with: it lands in the queue and
   toasts if the feed isn't on screen, the same as any other notification.

4. `documentation/developer-documentation/tab-plugins.md` (line 97): soften "whether the feed is
   open to receive it at all" — the queue means the line is never lost even when the feed isn't
   visible, so the host instead chooses the event type, the attribution, and whether the line
   toasts or is shown directly in an already-visible feed.

5. Re-read each changed page section by section against the relevant spec sections, and confirm
   every cross-page link on the touched pages still resolves (unchanged link targets, since no
   pages are renamed or moved).

## Tests

None — documentation only, no code or test changes.

## Out of scope

- The PR description event-inventory entry and the notification-record FIFO fix — separate,
  already-resolved backlog items.
- Any documentation page or sentence not naming the retired reveal-on-notification behavior.
- `product/specs/notifications.md` itself, which is already accurate and is the source these pages
  are being brought in line with.
