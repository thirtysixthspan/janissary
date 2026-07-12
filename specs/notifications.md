# Notifications

The **notifications tab** is a singleton, view-only feed that collects notification-worthy
background events as lines in its own scrollable transcript. It is a non-agent **view tab**
(`view: 'notifications'`): it renders the standard transcript body fed by its own log, but has no
command bar and takes no typed input. Like the file tree tab (see `file-tree-tab.md`) it is a
**live, in-memory view** — never persisted, never restored on `--relaunch`. When the feed is empty
it shows no content at all — unlike an agent tab's empty transcript, it does not show the "Type
`help` for available commands" hint, since there is no command bar to type into.

There is only ever **one** notifications tab, and it is **never created automatically**. It
appears only when the user runs the `notifications` command; opening it again reuses the existing
one. Its label is always `notifications`; per [[tab-label-no-markers]] no type or status marker is
appended.

### `notifications [left|right]`

`notifications` opens the notifications tab — or, if it is already open, focuses it (undocking it
back to the center strip and making it active when it was docked, since focusing must make the feed
visible). A leading `left` or `right` keyword docks it into that sidebar instead of the center
strip, mirroring `files [left|right]` (see `file-tree-tab.md` and `sidebars.md`). When the target
sidebar already holds another dockable tab (the file navigator or an existing notifications tab),
that tab is displaced back to the center strip — nothing is closed as a side effect.

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
docked**, matching the file tree tab, and styled the same way as the file tree tab's metadata
header. Center placement is reached via the bare `notifications` command, not the dock-cycle
button. The header carries no close button of its own; a docked notifications tab is closed from
the sidebar's own strip (see `sidebars.md`).

### Events that notify

Five event types can produce a notification line:

- **`state-change`** — an agent tab's busy flag clears (busy → idle), e.g. an ACP turn finishes or
  errors.
- **`incoming-message`** — a `msg` or `broadcast` is delivered to a tab (detected by the delivered
  entry carrying a sender).
- **`schedule-fire`** — a scheduled command fires in a tab (see `scheduling.md`).
- **`agent-start`** — an ACP session begins its first turn (busy false → true).
- **`manual`** — an explicit `notify <message>` (see below).

The four ambient events (`state-change`, `incoming-message`, `schedule-fire`, `agent-start`) are
each **independently togglable and default off** — opt in by editing `.janissary/config.json` (see
`application-config.md`). The `manual` event has no toggle: an explicit `notify` always fires.

### Focus suppression

An ambient event on the **currently active** tab never produces a notification — only background
tabs feed the notifications tab. The notifications tab itself is a view tab that produces no such
events, so it never notifies about itself. The `manual` event **bypasses focus suppression**: a
`notify` from the focused tab still records a line, because the caller opted in by invoking the
command.

### Drop-if-closed

An event is recorded only if the notifications tab is open **at the moment the event fires**. There
is no backlog: events fired while the tab is closed are dropped, not buffered, and never cause the
tab to open or be created. Closing the tab and reopening it starts a fresh, empty feed. This holds
for `notify` too — if the feed is closed, the message is dropped.

### `notify <message>`

`notify <message>` pushes a custom line into the feed, attributed to the issuing tab (e.g.
`build-agent: deploy finished`). It is the deliberate counterpart to the four ambient events: an
explicit signal that bypasses focus suppression and the per-event toggles, subject only to the
drop-if-closed rule. It is available from any tab, including agent tabs (an agent dispatches it like
any other command). It records a confirmation entry in the issuing tab. `notify` with no message is
a usage error (`Usage: notify <message>.`) and records nothing in the feed.

### Delivery model

Notifications are ordinary transcript entries appended to the notifications tab through the same
`append` path every tab write uses, and reach the client on the existing per-tab transcript
broadcast (`bufferLines`). There is no toast banner, no sound, and no dedicated server→client push
channel — a docked notifications tab renders its feed even though it is never the active tab.

Every notification line carries a colored dot, matching the sending tab's own tab-strip dot
color — the same colored-dot treatment already used for cross-agent `msg`/`broadcast` deliveries.
The sending tab is the background tab whose activity produced the event (or, for `notify`, the
issuing tab).

### Ordering and timestamps

The feed displays **newest first**: the most recently recorded notification appears at the top,
with earlier ones below it. Each line reads `● <time> <tab>: <message>` — the colored dot, then a
compact 12-hour clock time (for example `8:32pm`), the originating tab's label, and the message.
The tab label appears **once**, in this header: a `notify <message>` shows the message on its own
without repeating the label ahead of it.
