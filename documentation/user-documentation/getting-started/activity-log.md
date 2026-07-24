# Activity log

Janissary saves everything that happens in every tab to a plain JSON log under `.janissary/log/`, so you can search or replay a session after it's over without reopening the app.

## Where the log lives

<img class="agent-float" src="/agents/hakim-south-east.png" alt="" />

Each day gets its own file, named for the local calendar date:

```
.janissary/log/2026-07-23.json
```

Every line in the file is one JSON object:

```
{"timestamp":"22:55:20.690","agent":"janus","text":"ls -la"}
```

| Field | What it holds |
|---|---|
| `timestamp` | Local time the line was logged, as `HH:MM:SS.mmm` |
| `agent` | The tab's label |
| `text` | The command, message, or output text |

A new file starts at local midnight, not UTC. The split follows your machine's clock and calendar, not a fixed time zone.

## What gets logged

Command input and its resulting output are logged as separate lines, so you can follow the request and the response in order. Messages sent between agents, ACP prompts and responses, and shell command output are all included.

## Retention

<img class="agent-float left" src="/agents/malik-south-west.png" alt="" />

The log is never cleared or compacted. Daily files accumulate under `.janissary/log/` until you remove them yourself.

This is separate from each tab's own transcript, the one [`--relaunch`](/user-documentation/getting-started/startup#resuming-a-session-with-relaunch) restores. The log on this page is a flat, all-tabs record that outlives any single tab, kept even after that tab closes.
