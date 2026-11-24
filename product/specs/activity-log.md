# Activity Log

All tab transcript text is recorded in activity log JSON files stored in `.janissary/logs/activity/`. The log is written alongside the in-memory tab state and serves as a persistent, chronological record of every session.

### Storage format

One file per day, named `<YYYY-MM-DD>.json`. Each line is a single JSON object representing one content event:

```
{"timestamp":"22:55:20.690","agent":"janus","text":"ls -la"}
```

### Entry fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | Local time when the content was logged, formatted as `HH:MM:SS.mmm` |
| `agent` | string | The label of the tab where the content appeared (the field name is unchanged by the removal of agent tabs) |
| `text` | string | The content text (command input, shell output, message text, etc.) |

### Coverage

Both command inputs and their resulting outputs are logged as separate entries, so the log captures the full back-and-forth of each tab session. ACP prompts and responses, and shell command output, are all included.

### Log rotation

A new file starts each local day, using the local date that `getDateStr` produces rather than a UTC date. Entries written before local midnight go to today's file; entries after midnight go to the next day's file. At launch a sweep deletes files last modified more than `logRetentionInDays` days before that launch, whatever `logEnabled` says. Files left in the old `.janissary/log/` directory are neither moved nor reaped.

### Lifecycle

`ActivityLogger` in `src/activity-log/logger.ts` is constructed at startup alongside the other `.janissary/` setup, but the directory is created lazily on the first entry actually written, so merely opening the app never leaves an empty directory. The directory is never cleared. With `logEnabled` false nothing is written and no directory is created. The first failed write prints one line to stderr beginning `activity log: write failed, not logging for the rest of this run:` and stops logging for the rest of the run; later entries are not retried. The activity log is a flat file with no indexing and no compaction.
