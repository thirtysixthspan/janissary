# Append-only Log

All tab transcript text is recorded in append-only JSON files stored in `.janissary/log/`. The log is written alongside the in-memory tab state and serves as a persistent, chronological record of every session.

### Storage format

One file per day, named `<YYYY-MM-DD>.json`. Each line is a single JSON object representing one content event:

```
{"timestamp":"22:55:20.690","agent":"janus","text":"ls -la"}
```

### Entry fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | Local time when the content was logged, formatted as `HH:MM:SS.mmm` |
| `agent` | string | The label of the tab (agent) where the content appeared |
| `text` | string | The content text (command input, shell output, message text, etc.) |

### Coverage

Both command inputs and their resulting outputs are logged as separate entries, so the log captures the full back-and-forth of each tab session. Messages sent between agents, ACP prompts and responses, and shell command output are all included.

### Log rotation

A new file is created each UTC day. Entries written before midnight go to today's file; entries after midnight go to the next day's file. There is no retention or rotation beyond daily file naming — old files accumulate until manually cleaned.

### Lifecycle

The log directory is initialized at startup (`initLogDir` in `src/logger.ts`) alongside the other `.janissary/` subdirectories. The directory is never cleared. The append-only log is a flat file — no indexing, no compaction.

