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
A toast is silent: no sound plays and no operating-system notification is raised, so a notification
only reaches you if you happen to be looking. A toast is also the shortened form of the line: it
carries no timestamp and none of the clickable targets the feed entry has, and a long message is cut
off after two lines. It tells you something happened and nothing more, which is why clicking it is
the way through to the detail. A docked feed holds its toasts back on whichever window is actually
showing it, so a second window still toasts for a notification the first one has already recorded.

Three notifications inside a ten-second window escalate on their own: the feed is made visible —
docked right if it doesn't exist, docked (not focused) if it exists hidden, left exactly where it
is if already docked — and every toast on screen clears at once, since the feed now shows those
same lines. A notification that was detected earlier and only delivered now, such as a remote
harness's queued approval arriving when you reattach, counts toward that burst but never raises a
toast of its own; the feed is the only place you will see it.

Every notification is also appended to `.janissary/notifications.json`, one JSON line per
notification, as a durable trail that outlives the run. `notifications clear` is what empties the
queue, that file, and any toasts on screen — it opens and moves nothing, so an already-open feed
just goes empty. `clear` is exclusive with a dock keyword: `notifications right clear` docks the
feed right and clears nothing, since the command reads a single keyword.

## Reading the record file

That file is yours to grep, and it is the only place a notification outlives `notifications clear`'s
reach in the sense that clearing empties it too — but nothing ever reads it back. The app never
loads it, never rotates it, and never caps its size; it grows one line per notification until you
clear it or delete it yourself. Each line carries `detectedAt` as a full timestamp, the `event` that
produced it, the `tab` it came from, and the `message` you saw, plus `openFile` and `openTab` entries
when the event carries somewhere to jump to. A write that fails — a read-only checkout, a full disk —
is abandoned silently for the rest of the run, with nothing on screen and nothing in the feed, so a
file that has stopped growing has no symptom to explain it.

## Read and scroll the feed

The newest notification appears at the top. Each entry starts with the originating tab's colored dot, a compact 12-hour time such as `8:32pm`, and the tab label. The message follows that header. A notification detected on an earlier calendar day than today — for example, one queued while a remote harness sat detached over a weekend — carries a short date ahead of the time, such as `Sep 20 8:32pm`, so it doesn't read as having just happened.

Click or move keyboard focus into the feed. While it has focus, `↑` and `↓` scroll by a line, and `Page Up` and `Page Down` scroll by a page. These keys scroll the content without selecting rows. A docked feed doesn't respond to arrows while another tab has focus. You can also use the mouse wheel. A docked feed that has more lines than fit scrolls inside its own area; the sidebar beside it and the app around it never grow or shift.

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

`notify <message>` posts your own line into the feed. For example, `notify deploy finished` adds `deploy finished` after the time and originating-tab header. It has no toggle and bypasses focus suppression, so it can report from the active tab too. It lands in the queue and, when no feed is on screen, appears as a toast, the same as any other notification. Bare `notify` prints `Usage: notify <message>.`

Typing either `notifications` or `notify` also writes one line into the transcript of the tab you typed it in: your command as the input, and nothing as the output. That echo is the confirmation for a command that otherwise prints nothing, and it is the only trace the command leaves behind — no output, and no answer either way..

## Read diagnostic messages

`harness recording failed` and `ssh recording failed` mean that recording has stopped for that session, while the session itself keeps running. `no harness transcript found` is a separate diagnostic: the harness has no available session transcript, but screen-based monitoring remains available. Each diagnostic is reported once per affected tab. See [Recordings](/user-documentation/advanced-agents/harness#recordings) and [Opening a session transcript](/user-documentation/advanced-agents/harness#opening-a-session-transcript).

These diagnostics bypass the five event toggles and focus suppression, and they land in the queue and toast the same way other notifications do.

`No opener for ".xyz" files.` means you opened a file type Janissary has no viewer for, whether you typed `open` or double-clicked a row in the [file navigator](/user-documentation/tab-types/file-navigator). It arrives here rather than in the tab you opened from, because a file navigator has no transcript of its own to print it in. See [Opening files and pages](/user-documentation/tab-types/opening-files).

A launch that never opened reports here too. `Cannot launch "<name>": …` means a harness or agent launch was refused because that name was already taken, because a leftover workspace of that name couldn't be removed, or because the host had no project root the launch could use; `All agent names are in use.` is the same kind of line. `Removed leftover workspace "<name>" (<path>) before launching.` says a leftover folder with nothing running in it was removed to clear the way, with ` on <host>` after the name when the folder was on a remote host. `Cloned <url> into <path> on <host>.` says you accepted an offer to clone a missing project root onto a remote host. `Remote janus on <host> refused a request: <message>` means the host turned a request down after its workspace was ready, and the session is still alive. See [Agents](/user-documentation/getting-started/agents#names), [Harness tabs](/user-documentation/advanced-agents/harness#labels), and [Remote agents](/user-documentation/advanced-agents/remote-agents#when-the-name-is-already-in-use) for the full set of lines.

These four bypass the five event toggles and focus suppression, the way the recording diagnostics do, and each is attributed to the tab you typed the command in.

Other messages are explained with the feature that produces them: [harness approvals and browser failures](/user-documentation/advanced-agents/harness), [agent questions](/user-documentation/advanced-agents/agent-questions), [editor persona queries](/user-documentation/tab-types/editor-persona-query), [file operations](/user-documentation/tab-types/file-navigator), [unplayable audio](/user-documentation/tab-types/audio-player), and [plugin failures](/user-documentation/command-bar/plugins).

## Docking to a sidebar

<img class="agent-float" src="/agents/orhan-south-west.png" alt="" />

The notifications feed can sit in the central tab strip or dock into the left or right sidebar, exactly like the [file navigator](/user-documentation/tab-types/file-navigator). `notifications left` and `notifications right` open or move it into that sidebar; bare `notifications` brings a docked feed back to center and focuses it.

The feed can share a sidebar with the [file navigator](/user-documentation/tab-types/file-navigator), [schedules](/user-documentation/automation/scheduling), and [conversation list](/user-documentation/tab-types/conversations). Docking the feed leaves those views in place. While docked, its header contains only the dock-cycle button, which moves it to the other side. Close the feed with the **×** beside its label in the sidebar's tab strip. See [Tabs](/user-documentation/getting-started/tabs) for more on sidebars.

![Notifications and a file navigator sharing a sidebar, with close buttons beside their tab labels and a separate dock-cycle button below.](/screenshots/sidebar-shared.png)

The sidebar strip owns the close buttons; the feed's header below it owns the dock-cycle control.

You can also use `close notifications` from another tab. Bare `close` closes the active central tab, so it doesn't target a docked feed. The feed is not restored by `janus --relaunch`.
