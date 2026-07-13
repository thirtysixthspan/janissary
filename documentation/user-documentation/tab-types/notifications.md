# Notifications

`notifications` opens one feed tab that collects things happening in your *other* tabs, so you don't have to watch each one:

```
notifications         open the feed (or focus it if already open)
notifications left    open it docked in the left sidebar
notifications right   open it docked in the right sidebar
```

There is only ever one notifications tab, and it never appears on its own — it shows up only when you run `notifications`. The feed is a plain, scrollable list with no command line: it takes no input, it just displays notifications. Closing it and reopening it starts over with an empty feed.

<img class="agent-float" src="/agents/malik-south-east.png" alt="" />

Nothing is collected while the feed is closed. Events that happen before you open it — and any `notify` message — are dropped, not saved up for later. Open the feed first, then the events that follow start landing in it.

## What it reports

The feed can report four kinds of background activity, and every one is **off until you turn it on**. Enable the ones you want by editing `.janissary/config.json`:

```json
{
  "notifications": {
    "events": {
      "stateChange": true,
      "incomingMessage": true,
      "scheduleFire": true,
      "agentStart": true
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

A notification only fires for a **background** tab — the tab you're currently looking at never notifies you about its own activity, since you can already see it.

## Post your own line with `notify`

<img class="agent-float left" src="/agents/fariz-south-west.png" alt="" />

`notify <message>` posts a line of your own into the feed, labeled with the tab it came from — for example `build-agent: deploy finished`. Unlike the four events above, `notify` has no toggle and ignores the focused-tab rule: it always shows, even when you send it from the tab you're looking at, because you asked for it explicitly. It's meant for agents to flag something worth your attention. The one rule it still obeys is the same as everything else here: if the feed is closed, the message is dropped. `notify` on its own, with no message, just prints `Usage: notify <message>.`

## Docking to a sidebar

The notifications feed can sit in the central tab strip or dock into the left or right sidebar, exactly like the [file navigator](/user-documentation/tab-types/file-navigator). `notifications left` and `notifications right` open or move it into that sidebar; bare `notifications` brings a docked feed back to center and focuses it.

The two share the sidebars: each sidebar holds one docked tab, so docking the feed into a side that already holds the file navigator sends the navigator back to center rather than closing it. While docked, the feed's header shows a **⇄** button to move it to the other side and a **×** button to close it. See [Tabs](/user-documentation/getting-started/tabs) for more on sidebars.

Like other view tabs, the notifications feed is a live view: it's closed with its `×` button or `close`, and it is not restored by `janus --relaunch`.
