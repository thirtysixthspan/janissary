# Activity log

Janissary saves what your agent tabs say to a plain JSON log under `.janissary/log/`, so you can search or replay a session after it's over without reopening the app. "What your agent tabs say" is the whole of it: the log records the commands you run and the output they produce, plus the messages agents send each other. Two kinds of tab are not in it at all. A [harness](/user-documentation/advanced-agents/harness) tab's session lives in its own terminal, not in a transcript, so nothing of a harness run reaches the log. And a view tab, meaning an [editor](/user-documentation/tab-types/editor), a [page](/user-documentation/tab-types/web-pages), an [image](/user-documentation/tab-types/image-viewer), the [file navigator](/user-documentation/tab-types/file-navigator), or the [schedules](/user-documentation/automation/scheduling) list, has no transcript to record, so opening, editing, or browsing in one leaves no trace here.

## Where the log lives

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

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

<img class="agent-float left" src="/agents/ekrem-south-east.png" alt="" />

The log is never cleared or compacted. Daily files accumulate under `.janissary/log/` until you remove them yourself. One file beside them behaves the opposite way: `server.log` is the app's own output, cleared at the start of every ordinary launch and appended to across a `janus --relaunch`. If you are grepping `.janissary/log/` for why a launch failed, that is the one you want, and it is the one that empties itself; see [Troubleshooting](/user-documentation/getting-started/startup#troubleshooting).

This is separate from each tab's own transcript, the one [`--relaunch`](/user-documentation/getting-started/startup#resuming-a-session-with-relaunch) restores. The log on this page is a flat, all-tabs record that outlives any single tab, kept even after that tab closes.
