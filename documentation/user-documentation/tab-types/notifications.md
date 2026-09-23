# Notifications

Use `notifications` to watch background activity and diagnostic messages from your tabs in one feed:

```
notifications         open the feed (or focus it if already open)
notifications left    open it docked in the left sidebar
notifications right   open it docked in the right sidebar
notifications clear   empty the queue, the record file, and any toasts on screen
```

There is only ever one notifications tab. The feed has no command line. Every notification of the
current run is held in a queue (the most recent 200), independent of whether the feed is open —
closing it and reopening it loses nothing, since the reopened feed is seeded from the queue.

<img class="agent-float" src="/agents/hamza-south-west.png" alt="" />

You don't have to open it first. A notification with no feed on screen appears as a **toast** in
the window's upper-right corner instead: visible for about four seconds, then fading out over two,
without opening or rearranging anything. Hovering a toast holds its clock; moving away resumes it
with the time that was left. Clicking a toast makes the feed visible — docked into the right
sidebar if it doesn't exist yet, brought onto screen without changing which tab you're working in.

Three notifications inside a ten-second window escalate on their own: the feed is made visible —
docked right if it doesn't exist, docked (not focused) if it exists hidden, left exactly where it
is if already docked — and every toast on screen clears at once, since the feed now shows those
same lines.

Every notification is also appended to `.janissary/notifications.json`, one JSON line per
notification, as a durable trail that outlives the run. `notifications clear` is what empties the
queue, that file, and any toasts on screen — it opens and moves nothing, so an already-open feed
just goes empty. `clear` is exclusive with a dock keyword: `notifications right clear` docks the
feed right and clears nothing, since the command reads a single keyword.

## Read and scroll the feed

The newest notification appears at the top. Each entry starts with the originating tab's colored dot, a compact 12-hour time such as `8:32pm`, and the tab label. The message follows that header. A notification detected on an earlier calendar day than today — for example, one queued while a remote harness sat detached over a weekend — carries a short date ahead of the time, such as `Sep 20 8:32pm`, so it doesn't read as having just happened.

Click or move keyboard focus into the feed. While it has focus, `↑` and `↓` scroll by a line, and `Page Up` and `Page Down` scroll by a page. These keys scroll the content without selecting rows. A docked feed doesn't respond to arrows while another tab has focus. You can also use the mouse wheel.

## What it reports

The feed can report five kinds of background activity, and every one defaults to `false`. Enable the ones you want by editing `.janissary/config.json`:

```json
{
  "notifications": {
    "events": {
      "stateChange": true,
      "incomingMessage": true,
      "scheduleFire": true,
      "agentStart": true,
      "rateLimited": true
    }
  }
}
```

Each toggle controls one kind of event:

| Toggle | Notifies when |
|---|---|
| `stateChange` | An agent finishes (its turn ends or errors out) |
| `incomingMessage` | A `msg` or `broadcast` arrives at a tab |
| `scheduleFire` | A scheduled command fires in a tab |
| `agentStart` | An agent begins a turn |
| `rateLimited` | A model query is identified as rate limited |

These five events notify only for a **background** tab. Activity in the currently active tab is suppressed.

`notifications.events.rateLimited` covers interactive `acp` queries, periodic monitor queries, and `monitor ask` queries. It recognizes rate limits from error text, and also from an interactive query's ordinary reply text. The feed says `Agent '<tab>' is being rate limited`; the original in-tab output stays available. Other failures don't produce this event.

A command that fires more than five seconds late ignores all five toggles and posts regardless, even from the active tab. See [Sleep and resume](/user-documentation/getting-started/sleep-and-resume#overdue-scheduled-commands) for when that happens.

## Post your own line with `notify`

<img class="agent-float left" src="/agents/mahir-south.png" alt="" />

`notify <message>` posts your own line into the feed. For example, `notify deploy finished` adds `deploy finished` after the time and originating-tab header. It has no toggle and bypasses focus suppression, so it can report from the active tab too. It lands in the queue and, when no feed is on screen, appears as a toast, the same as any other notification. Bare `notify` prints `Usage: notify <message>.`.

## Read diagnostic messages

`harness recording failed` and `ssh recording failed` mean that recording has stopped for that session, while the session itself keeps running. `no harness transcript found` is a separate diagnostic: the harness has no available session transcript, but screen-based monitoring remains available. Each diagnostic is reported once per affected tab. See [Recordings](/user-documentation/advanced-agents/harness#recordings) and [Opening a session transcript](/user-documentation/advanced-agents/harness#opening-a-session-transcript).

These diagnostics bypass the five event toggles and focus suppression, and they land in the queue and toast the same way other notifications do.

`No opener for ".xyz" files.` means you opened a file type Janissary has no viewer for, whether you typed `open` or double-clicked a row in the [file navigator](/user-documentation/tab-types/file-navigator). It arrives here rather than in the tab you opened from, because a file navigator has no transcript of its own to print it in. See [Opening files and pages](/user-documentation/tab-types/opening-files).

Other messages are explained with the feature that produces them: [harness approvals and browser failures](/user-documentation/advanced-agents/harness), [agent questions](/user-documentation/advanced-agents/agent-questions), [editor persona queries](/user-documentation/tab-types/editor-persona-query), [file operations](/user-documentation/tab-types/file-navigator), [unplayable audio](/user-documentation/tab-types/audio-player), and [plugin failures](/user-documentation/command-bar/plugins).

## Docking to a sidebar

<img class="agent-float" src="/agents/orhan-south-west.png" alt="" />

The notifications feed can sit in the central tab strip or dock into the left or right sidebar, exactly like the [file navigator](/user-documentation/tab-types/file-navigator). `notifications left` and `notifications right` open or move it into that sidebar; bare `notifications` brings a docked feed back to center and focuses it.

The feed can share a sidebar with the [file navigator](/user-documentation/tab-types/file-navigator), [schedules](/user-documentation/automation/scheduling), and [conversation list](/user-documentation/tab-types/conversations). Docking the feed leaves those views in place. While docked, its header contains only the dock-cycle button, which moves it to the other side. Close the feed with the **×** beside its label in the sidebar's tab strip. See [Tabs](/user-documentation/getting-started/tabs) for more on sidebars.

![Notifications and a file navigator sharing a sidebar, with close buttons beside their tab labels and a separate dock-cycle button below.](/screenshots/sidebar-shared.png)

The sidebar strip owns the close buttons; the feed's header below it owns the dock-cycle control.

You can also use `close notifications` from another tab. Bare `close` closes the active central tab, so it doesn't target a docked feed. The feed is not restored by `janus --relaunch`.
