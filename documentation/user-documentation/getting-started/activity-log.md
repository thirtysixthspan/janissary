# Activity log

Janissary records application commands and their captured replies in a JSON activity log under `.janissary/log/`. Core ACP replies and notification entries can also appear there. Native shell commands and harness terminal output use their terminal recordings rather than this log. See [Harness recordings](/user-documentation/advanced-agents/harness#the-recording-flag).

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
| `zsh` | The tab's label |
| `text` | The command, message, or output text |

A new file starts at local midnight, not UTC. The split follows your machine's clock and calendar, not a fixed time zone.

## What gets logged

Command input and its resulting output are logged as separate lines, so you can follow the request and the response in order. Core ACP prompts and responses are included.

Each line holds those three fields. The field named `agent` identifies the tab label; it does not name an agent-tab type.

## Retention

<img class="agent-float left" src="/agents/ekrem-south-east.png" alt="" />

The log is never cleared or compacted. Daily files accumulate under `.janissary/log/` until you remove them yourself. One file beside them behaves the opposite way: `server.log` is the app's own output, cleared at the start of every ordinary launch and appended to across a `janus --relaunch`. If you are grepping `.janissary/log/` for why a launch failed, that is the one you want, and it is the one that empties itself; see [Troubleshooting](/user-documentation/getting-started/startup#troubleshooting).

This is separate from each tab's own transcript, which lasts only as long as the tab. The log on this page is a flat, all-tabs record that outlives any single tab, kept even after that tab closes.
