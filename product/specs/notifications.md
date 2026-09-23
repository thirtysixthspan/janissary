# Notifications

Holding a notification and showing one are separate things. Every notification the user is given is
held in a **notification queue** for the length of the run, whether or not anything is on screen to
display it. Two surfaces render that queue: the **notifications tab**, a feed of every notification
held, and a **toast** in the window's upper-right corner, which shows a single notification when no
feed is visible. Neither surface owns the notification, so closing the feed discards nothing and a
toast expiring loses nothing.

The **notifications tab** is a singleton, view-only feed that renders the queue as lines in its own
scrollable transcript. It is a non-agent **view tab** (`view: 'notifications'`): it renders the
standard transcript body fed by its own log, but has no command bar and takes no typed input. Like
the file navigator tab (see `file-navigator-tab.md`) it is a **live, in-memory view** — never
persisted, never restored on `--relaunch`. When the feed is empty it shows no content at all —
unlike an agent tab's empty transcript, it does not show the "Type `help` for available commands"
hint, since there is no command bar to type into.

There is only ever **one** notifications tab. The user opens it with the `notifications` command,
which chooses where it goes; a burst of notifications opens it too, docked into the right sidebar,
when nothing on screen is showing them (see "Toasts and escalation" below). Opening it again reuses
the existing one. Its label is always `notifications`; per [[tab-label-no-markers]] no type or
status marker is appended.

### The notification queue

The queue holds every notification of the current run, oldest dropped first past **200**. It
survives the notifications tab being closed and reopened — a feed opened at any moment renders
whatever the queue still holds, including notifications raised long before it existed. It is held
in memory only: it is not persisted and not restored by `--relaunch`, which keeps the feed a live
view rather than a restored one.

Because the feed renders the queue, 200 is also the most the feed can show. A session that produces
more than that loses the oldest lines from the feed; the notification record below is the durable
trail for reading further back.

### The notification record

Every notification is also appended to **`.janissary/notifications.json`**, one JSON object per
line, as it is recorded. The file persists across runs and is never read back by the application —
it is a durable trail to grep, not a source the queue is restored from.

Each line carries the notification's full ISO detection time (unambiguous across days, unlike the
feed's `8:32pm`), the event type, the originating tab, the message, and the link targets when the
event has them. The dot color is not recorded — it is a rendering detail of a session the file
outlives.

The file only grows; there is no rotation and no size cap. `notifications clear` is what empties it.
Writing it is best-effort and silent: a write that fails (no permission, a full disk, a read-only
checkout) is swallowed, further writes are abandoned for the rest of the run, and the queue, the
feed, and toasts are unaffected. The failure is deliberately not itself reported as a notification.

### `notifications [left|right|clear]`

`notifications` opens the notifications tab — or, if it is already open, focuses it (undocking it
back to the center strip and making it active when it was docked, since focusing must make the feed
visible). A leading `left` or `right` keyword docks it into that sidebar instead of the center
strip, mirroring `files [left|right]` (see `file-navigator-tab.md` and `sidebars.md`). When the target
sidebar already holds another dockable tab (the file navigator or an existing notifications tab),
that tab is displaced back to the center strip — nothing is closed as a side effect.

`notifications clear` empties everything a notification is held in: the queue, the record file, and
any toasts on screen. It opens and moves nothing — a feed already open simply goes empty, and a
closed one stays closed. `clear` is exclusive with a dock keyword: the command reads a single
keyword, so `notifications right clear` docks the feed right and clears nothing.

Running the command records a transcript entry for it in the issuing tab (the command text as
input, empty output) before the tab opens, the same as `files`.

### Docking

The notifications tab is dockable on the same terms as the file navigator: at most one docked
notifications tab per sidebar (docking a second one displaces the first), a docked tab is never
the active tab, and neither dock placement nor sidebar width is persisted (see `sidebars.md`).
The notifications tab and the file navigator can share one sidebar side at the same time — docking
one into a side already holding the other does not displace it, and the sidebar shows a
tab-switcher to flip between them (see `sidebars.md`'s "Sharing a sidebar").

When docked, a feed longer than the sidebar can render scrolls within the notifications tab's own
content area — the sidebar and the rest of the app never grow to accommodate it — matching how the
file navigator's own row list scrolls in place.

The tab's own header carries a dock-cycle button (toggling left↔right) — shown **only while
docked**, matching the file navigator tab, and styled the same way as the file navigator tab's metadata
header. Center placement is reached via the bare `notifications` command, not the dock-cycle
button. The header carries no close button of its own; a docked notifications tab is closed from
the sidebar's own strip (see `sidebars.md`).

### Events that notify

- **`schedule-late`** — a scheduled command is delivered more than five seconds late: `<command> ran <duration> late (system was asleep)` if it was already overdue when the machine last resumed, or `<command> ran <duration> late` otherwise.
- **`remote-session-terminated`** — a remote peer, harness, or shell is confirmed to have terminated: `<what> on <host> terminated — create a new agent or shell to continue.` The affected tab stays open; no replacement session starts automatically.
- **`remote-session`** — a remote session was detached, attached, terminated, or forgotten from the sessions tab or a tab's metadata row: `<what> on <host> detached — attach it from the sessions tab.`, `<what> on <host> attached.`, `<what> on <host> terminated.`, or `<what> on <host> forgotten — its record was removed.` `<what>` is the name the session's row shows. Distinct from `remote-session-terminated`, which reports a session terminating on its own rather than a decision the user made; each line is plain text carrying no click target, and is recorded so the change survives the tabs it happened to.

These event types can produce a notification line:

- **`state-change`** — an agent tab's busy flag clears (busy → idle), e.g. an ACP turn finishes or
  errors.
- **`incoming-message`** — a `msg` or `broadcast` is delivered to a tab (detected by the delivered
  entry carrying a sender).
- **`schedule-fire`** — a scheduled command fires in a tab (see `scheduling.md`).
- **`agent-start`** — an ACP session begins its first turn (busy false → true).
- **`rate-limited`** — an ACP query fails because the underlying provider is rate limiting
  requests, detected by a best-effort match against the failure's text. This covers every ACP query
  path: an agent tab's interactive `acp <prompt>` command, a monitor persona's periodic background
  query, and a direct `monitor ask <persona> <question>`. Detection matches both a thrown ACP error
  and — for the interactive `acp <prompt>` command — a rate limit the agent surfaces as its ordinary
  reply text rather than an error, so a query that is rate limited but resolves normally is not
  missed. The notification is additive — it appears alongside the existing in-tab output, which is
  unchanged. A non-rate-limit ACP outcome produces no `rate-limited` notification.
- **`manual`** — an explicit `notify <message>` (see below).
- **`auto-approve`** — a harness launched with `-y` auto-approves one of its own
  permission prompts (see `harness.md`).
- **`editor-suggest`** — an in-editor persona-suggestion request fails or comes back empty (see
  `editor-tab.md`).
- **`question`** — an ACP agent issues a question command while its owning tab is not focused
  (see [[agent-questions]]). The tab label on this line is a link that focuses the asking tab.
- **`transcript-unavailable`** — a harness tab's session record could not be found, so the tab is
  limited to screen snapshots and has no transcript file (see [[harness-recording]]). The line reads
  `no harness transcript found` and is recorded once per tab, never repeated.
- **`ssh-recording-failed`** — an ssh tab's session recording could not be written, so the session is
  no longer being recorded (see [[harness-recording]]). The line reads `ssh recording failed` and is
  recorded once per tab, never repeated. Like the explicit events, it fires even while the ssh tab is
  the active one — the tab whose recording just failed is very often the one being watched. The ssh
  session itself is unaffected.
- **`harness-recording-failed`** — the same event for a harness tab, on the same terms: the line
  reads `harness recording failed`, is recorded once per tab and never repeated, fires even while
  that tab is the active one, and leaves the harness session itself unaffected.
- **`e2e-browser-gone`** — a `-b` tab's browser is no longer there: a launch that failed, a browser
  that exited, or a guard that died (see `harness.md`). The line names the tab it belonged to and
  carries the browser's own last words beneath the message. When the browser said anything at all,
  the line also carries a link that opens the full account in an editor tab — the message is held to
  a readable tail, and a crash trace is longer than that tail. Like the explicit events it fires even
  while that tab is the active one, since the agent whose next connection is about to fail is working
  in it.
- **`file-operation`** — a file navigator copy, cut/paste, move, delete, or undo/redo replay fails
  for one or more of the items it acted on (see `file-navigator-tab.md`). The line reads
  `Could not <verb> <failed> of <total> items: <names>`, naming the failing items in selection
  order and truncating past three names with `… and N more`. A shared cause and recovery action is
  appended once. If the named items failed for different reasons, the suffix reads `Reasons:
  <name>: <reason> | <name>: <reason>` instead. A file navigator pull reports through this same event
  and is one of two cases that also report a success: `Pulled from origin: <git summary>` when the
  pull worked, `Could not pull: <git error>` when it did not. A file navigator commit is the other,
  and reports three lines: `Committed to origin: <git summary>` when it landed, `Could not commit:
  <git error>` when it failed, and `Nothing to commit` when there was nothing staged to commit.
- **`open-unsupported`** — `open <file>` found no opener registered for the file's extension (see
  [[open]]). The line is the same `No opener for "<ext>" files.` the dispatcher has always
  produced, attributed to the tab the command was issued from. It is reported here rather than in
  that tab's transcript because a file navigator activation produces it too, and a file navigator
  renders rows rather than a transcript — the message would be written where nobody reads it. It is
  the only one of the dispatcher's errors that moves: a missing file, a malformed invocation, an
  unviewable web address, and a plugin command's refusal are all still reported where the command
  was typed.
- **`plugin-note`** — a tab plugin reports one line of its own, through the narrow capability the
  host grants for it (see [[tab-plugins]]). The line is the plugin's own text; the plugin chooses
  neither the event type, nor the tab it is attributed to, nor any link on the line. The bundled
  audio plugin uses it to name a track it had to drop from a playlist because the browser could not
  decode it (see [[audio-tab]]).

The five ambient events (`state-change`, `incoming-message`, `schedule-fire`, `agent-start`,
`rate-limited`) are each **independently togglable and default off** — opt in by editing
`.janissary/config.json` (see `application-config.md`). The `manual`, `auto-approve`,
`editor-suggest`, `question`, `transcript-unavailable`, `e2e-browser-gone`, `file-operation`,
`open-unsupported`, `plugin-note`, `schedule-late`, `remote-session-terminated`, and `remote-session` events have no toggle. A `question` event fires only for a
background tab.

### Focus suppression

An ambient event on the **currently active** tab never produces a notification — only background
tabs feed the notifications tab. The notifications tab itself is a view tab that produces no such
events, so it never notifies about itself. The `manual`, `auto-approve`, `editor-suggest`,
`transcript-unavailable`, `e2e-browser-gone`, `file-operation`, `open-unsupported`, and
`plugin-note`, `schedule-late`, `remote-session-terminated`, and `remote-session` events **bypass focus suppression**: they still
record a line even when their tab is active, because they report an explicit, user-armed action, a
capability degrading, or a plugin's own deliberate report, rather than ambient background activity.
For `plugin-note` this is the case that matters most: a plugin reporting on the very tab the user is
watching — a playlist shedding a track — is exactly the line that must not be discarded. A
`question` is also an
explicit event with no configuration toggle, but it is emitted only when its owning tab is in the
background.

### Toasts and escalation

A notification raised while the feed is not on screen appears as a **toast** in the upper-right
corner of the window. "Not on screen" is a visibility test, not an existence one: a feed docked into
either sidebar is always rendered, so it suppresses the toast, while a feed sitting in the centre
strip behind another tab shows nothing and so does not. A toast never opens or moves a tab — the
layout the user arranged is left alone.

A toast reads `● <tab>: <message>`: the same colored dot and originating tab label the feed line
carries, and the same message body, with **no timestamp** — a toast is by definition happening now.
Link targets are not rendered on it; they are preserved in the queue and the record, so the link is
still there in the feed. A long message is clamped to two lines.

It is visible for **4 seconds** and then fades out over **2 seconds**. Hovering a toast holds its
clock, and returns a fading one to fully visible; moving away restarts it with the time that was
left. **Clicking** a toast makes the feed visible and clears every toast on screen at once. The
stack begins beneath the connection indicator and the floating status panels that already occupy
that corner, so a toast never hides "Cannot reach session".

**A burst escalates to the feed.** On the third notification inside a ten-second window the
notifications tab is made visible and every toast is removed at once — sustained activity is more
than a corner can carry, and the feed now shows those same lines. It is made visible **docked, not
focused**: a feed that does not exist opens docked into the right sidebar, one already docked stays
where it is, and one hidden in the centre strip is docked right rather than made active. The active
tab is left exactly where it was. Docking into a sidebar that already holds a file navigator does
not displace that navigator; the two share the side (see `sidebars.md`). The feed renders the
queue, so the burst's earlier notifications are already in it when it appears.

A **replayed** notification — one whose caller reports a time it detected earlier, such as an
`auto-approve` queued by a detached remote harness and delivered on reattach (see [[remote-server]])
— reaches the queue, the record, and the feed, but never a toast: a toast carries no time and could
not honestly represent something that happened hours or days ago. Replays still count toward the
burst window, so a reattach delivering several of them docks the feed open: silence in the corner,
history in the feed.

Whether an event is recorded at all is still decided first, by the per-event toggles and focus
suppression above. An event those rules discard is held nowhere, recorded nowhere, and shown
nowhere — the ambient toggles remain the control over how much reaches the user.

Closing the notifications tab is purely a display action: it discards nothing, and the next
`notifications` reopens the feed rendering whatever the queue still holds. `notifications clear` is
the only thing that empties it.

### `notify <message>`

`notify <message>` pushes a custom line into the feed, attributed to the issuing tab (e.g.
`build-agent: deploy finished`). It is the deliberate counterpart to the four ambient events: an
explicit signal that bypasses focus suppression and the per-event toggles, and — like every other
recorded event — lands in the queue and, when no feed is on screen, appears as a toast.
It is available from any tab, including agent tabs (an agent dispatches it like
any other command). It records a confirmation entry in the issuing tab. `notify` with no message is
a usage error (`Usage: notify <message>.`) and records nothing in the feed.

### Delivery model

Feed lines are ordinary transcript entries appended to the notifications tab through the same
`append` path every tab write uses, and reach the client on the existing per-tab transcript
broadcast (`bufferLines`) — a docked notifications tab renders its feed even though it is never the
active tab. A feed opened after the fact is filled from the queue directly rather than by replaying
those appends.

A toast has no tab to ride, so it travels on its own server→client push: one event carrying the
originating tab, the message, and the dot color, and a second event that clears the corner. Both
are one-shot rather than state — nothing about a toast survives a reconnect, and a client that
reloads simply has an empty corner. There is still no sound and no OS-level notification.

Every notification line carries a colored dot, matching the sending tab's own tab-strip dot
color — the same colored-dot treatment already used for cross-agent `msg`/`broadcast` deliveries.
The sending tab is the background tab whose activity produced the event (or, for `notify`, the
issuing tab).

### Keyboard scrolling

The feed can be scrolled from the keyboard once it has focus. Focus it by clicking it (mouse) or by
tabbing to it (keyboard); while it holds focus, **Arrow Up/Down** scroll it a line at a time and
**Page Up/Page Down** scroll it a page at a time. The mouse wheel scrolls it as before. These keys
only act while the feed itself is focused — a notifications feed docked in a sidebar never scrolls in
response to arrows while a different tab is focused. The keys scroll the transcript; they do not move
a per-row selection.

### Ordering and timestamps

The feed displays **newest first**: the most recently recorded notification appears at the top,
with earlier ones below it. Each line reads `● <time> <tab>: <message>` — the colored dot, then a
compact 12-hour clock time (for example `8:32pm`), the originating tab's label, and the message.
The tab label appears **once**, in this header: a `notify <message>` shows the message on its own
without repeating the label ahead of it. A notification whose actual detection time falls on an
earlier calendar day than today — a queued report replayed after a multi-day detachment — carries
a short date ahead of the time (for example `Sep 20 8:32pm`) rather than the bare time alone, so it
does not read as having happened today; the comparison is calendar day, not elapsed hours, so an
event from late the previous night is still dated even a few hours later.
