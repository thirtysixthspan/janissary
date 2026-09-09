# Notifications

Use `notifications` to watch background activity and diagnostic messages from your tabs in one feed:

```
notifications         open the feed (or focus it if already open)
notifications left    open it docked in the left sidebar
notifications right   open it docked in the right sidebar
```

There is only ever one notifications tab, and it opens only when you run `notifications`. The feed has no command line. Closing it and reopening it starts over with an empty feed.

<img class="agent-float" src="/agents/hamza-south-west.png" alt="" />

Nothing is collected while the feed is closed. Events that happen before you open it, including any `notify` message, are dropped. Open the feed first, then the events that follow start landing in it.

## Read and scroll the feed

The newest notification appears at the top. Each entry starts with the originating tab's colored dot, a compact 12-hour time such as `8:32pm`, and the tab label. The message follows that header.

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

## Post your own line with `notify`

<img class="agent-float left" src="/agents/mahir-south.png" alt="" />

`notify <message>` posts your own line into the feed. For example, `notify deploy finished` adds `deploy finished` after the time and originating-tab header. It has no toggle and bypasses focus suppression, so it can report from the active tab too. If the feed is closed, the message is dropped. Bare `notify` prints `Usage: notify <message>.`.

## Read diagnostic messages

`harness recording failed` and `ssh recording failed` mean that recording has stopped for that session, while the session itself keeps running. `no harness transcript found` is a separate diagnostic: the harness has no available session transcript, but screen-based monitoring remains available. Each diagnostic is reported once per affected tab. See [Recordings](/user-documentation/advanced-agents/harness#recordings) and [Opening a session transcript](/user-documentation/advanced-agents/harness#opening-a-session-transcript).

These diagnostics bypass the five event toggles and focus suppression. They still disappear if the feed is closed when they occur.

`No opener for ".xyz" files.` means you opened a file type Janissary has no viewer for, whether you typed `open` or double-clicked a row in the [file navigator](/user-documentation/tab-types/file-navigator). It arrives here rather than in the tab you opened from, because a file navigator has no transcript of its own to print it in. See [Opening files and pages](/user-documentation/tab-types/opening-files).

Other messages are explained with the feature that produces them: [harness approvals and browser failures](/user-documentation/advanced-agents/harness), [agent questions](/user-documentation/advanced-agents/agent-questions), [editor persona queries](/user-documentation/tab-types/editor-persona-query), [file operations](/user-documentation/tab-types/file-navigator), [unplayable audio](/user-documentation/tab-types/audio-player), and [plugin failures](/user-documentation/command-bar/plugins).

## Docking to a sidebar

<img class="agent-float" src="/agents/orhan-south-west.png" alt="" />

The notifications feed can sit in the central tab strip or dock into the left or right sidebar, exactly like the [file navigator](/user-documentation/tab-types/file-navigator). `notifications left` and `notifications right` open or move it into that sidebar; bare `notifications` brings a docked feed back to center and focuses it.

The feed can share a sidebar with the [file navigator](/user-documentation/tab-types/file-navigator), [schedules](/user-documentation/automation/scheduling), and [conversation list](/user-documentation/tab-types/conversations). Docking the feed leaves those views in place. While docked, its header contains only the dock-cycle button, which moves it to the other side. Close the feed with the **×** beside its label in the sidebar's tab strip. See [Tabs](/user-documentation/getting-started/tabs) for more on sidebars.

![Notifications and a file navigator sharing a sidebar, with close buttons beside their tab labels and a separate dock-cycle button below.](/screenshots/sidebar-shared.png)

The sidebar strip owns the close buttons; the feed's header below it owns the dock-cycle control.

You can also use `close notifications` from another tab. Bare `close` closes the active central tab, so it doesn't target a docked feed. The feed is not restored by `janus --relaunch`.
