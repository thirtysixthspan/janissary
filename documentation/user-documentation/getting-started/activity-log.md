# Activity log

You can read a record of every tab's commands and replies in a JSON activity log under `.janissary/logs/activity/`. Core ACP replies and notification entries can also appear there. Native shell commands and harness terminal output use their terminal recordings rather than this log. See [Harness recordings](/user-documentation/advanced-agents/harness#the-recording-flag).

## Where the log lives

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

Each day gets its own file, named for the local calendar date:

```
.janissary/logs/activity/2026-07-23.json
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

Janissary creates the directory when it writes the first entry, so opening the app on its own never leaves an empty directory. Files left in the retired `.janissary/log/` folder are neither moved nor swept.

## What gets logged

Command input and its resulting output are logged as separate lines, so you can follow the request and the response in order. Core ACP prompts and responses are included.

Each line holds those three fields. The field named `agent` identifies the tab label; it does not name an agent-tab type.

## Turn logging off

<img class="agent-float left" src="/agents/ekrem-south-east.png" alt="" />

Set `logEnabled` to `false` in `.janissary/config.json` to stop writing activity entries. The default is `true`. With `false`, Janissary writes no entries and creates no log directory. Set it before you launch the app.

If a write fails, Janissary prints `activity log: write failed, not logging for the rest of this run:` in the terminal you launched it from and stops logging for the rest of that run. It does not retry later entries.

## Retention

<img class="agent-float" src="/agents/mahir-south.png" alt="" />

At each launch, Janissary deletes daily files last modified more than `logRetentionInDays` days earlier. The default is `7` days. With `0`, it keeps no files from earlier launches. Negative, fractional, and non-number values fall back to `7`. Set the value in `.janissary/config.json`; the sweep reads it at launch, so a change takes effect the next time you start the app. See [App configuration](/user-documentation/getting-started/configuration).

The sweep runs whether `logEnabled` is on or off, and Janissary never compacts the files it keeps. For messages from the app itself, see [Troubleshooting](/user-documentation/getting-started/startup#troubleshooting).

This is separate from each tab's own transcript, which lasts only as long as the tab. The log on this page is a flat, all-tabs record that outlives any single tab, kept even after that tab closes.
