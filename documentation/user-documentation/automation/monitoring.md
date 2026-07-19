# Monitoring with personas

<img class="agent-float" src="/agents/malik-south-east.png" alt="" />

`monitor` starts a persona-driven AI session that watches tab activity and surfaces suggestions, either inline in the tab you started it from or in a dedicated reporting tab:

```
monitor security bilal
monitor summarizer group:2
```

Monitors are tool-less by default and receive no filesystem or terminal access. See Persona web tools below for the one narrow exception.

## Inline vs. reporting-tab mode

`monitor <persona> [target...]` behaves differently depending on whether you give it targets:

- **No targets (inline mode)**: the monitor watches the tab you started it from and posts suggestions right into that tab's own transcript, prefixed with the persona name and a sparkle.
- **One or more targets (reporting-tab mode)**: the monitor watches the named tabs (or groups) instead, and its suggestions go to a dedicated reporting tab, colored after the tab(s) it watches.

A target is a tab label or `group:<n>`. A tab may also be named by its display alias (see [`rename`](/user-documentation/command-bar/commands)), matched case-insensitively; `unmonitor`'s target argument works the same way. Once the monitor's session connects, the owner tab's transcript shows a line naming the monitor, its model, and a one-sentence summary of the persona's role.

## The reporting tab

<img class="agent-float left" src="/agents/hakim-south-west.png" alt="" />

A reporting-mode monitor's tab carries a metadata line above its suggestion feed: the persona name, the tab(s)/group(s) it watches, and the total size sent to and received from its session so far (shown in bytes/kilobytes/megabytes). Two buttons sit at the right of that line:

- A **reset** button discards the monitor's accumulated context and reloads just its persona priming, the same recovery the monitor performs automatically after a session error.
- A **context snapshot** button opens the monitor's current accumulated context (persona priming, batched updates, questions, and replies) as a point-in-time snapshot in a text tab.

If two owner tabs share one reporting tab (the same persona started from two different tabs), resetting it resets every monitor feeding that tab.

## What a monitor sees

A monitor receives each target's **full existing history** the moment it starts, not just activity from then on:

- An agent tab feeds its complete transcript, in order.
- A harness or SSH tab has no transcript, so it instead feeds its latest on-screen text, refreshed only when the screen changes.
- An editor tab feeds its live (possibly unsaved) buffer content: the first feed is the full content, and every feed after that is a diff against what that monitor last saw.
- A page tab feeds only the text currently visible in its viewport, the same way: full content first, diffs after.

Group membership is re-checked continuously, so a tab that joins a monitored group later is picked up without restarting the monitor.

## The flush cycle

New activity from every target is buffered and sent to the monitor's session as a single batch prompt every 30 seconds. Nothing is sent when the buffer is empty or a previous prompt is still in flight.

## Suggestions and summaries

A monitor's reply is parsed for two possible marker lines: `[SUMMARY]:` recaps activity with no action attached, and `[SUGGESTION]:` offers something actionable, optionally paired with a `[COMMAND]:` line. A reply with neither marker (like a bare `OK`) delivers nothing.

In a reporting tab, a suggestion that carries a command shows it as a clickable line: clicking runs it in the tab the suggestion is about, queuing behind anything already queued there. Each suggestion also carries thumbs-up / thumbs-down buttons; either one removes the suggestion from the feed.

## Asking a monitor directly

`monitor ask <persona> <question>` sends a question straight to a running monitor's session, skipping the batch buffer. The reply lands in the owner tab's transcript.

## Persona web tools

A monitor has no tools by default. A persona file can opt into `web_search` and `web_fetch` with a second directive line:

```
[//]: # claude:Sonnet:high
[//]: # tools: web_search, web_fetch
```

These are the only two tools a persona can ever request this way. No filesystem or terminal access is ever granted to a monitor.

## Stopping a monitor

```
unmonitor security          stop the "security" monitor started from this tab
unmonitor --all             stop every monitor started from this tab
monitors                    list active monitors with their targets and suggestion counts
```

A monitor's session also ends on its own when its owner tab closes or every one of its tab targets has been removed. A reporting tab stays open as long as at least one monitor still feeds it, and closes once the last one stops.
