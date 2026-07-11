# AI Monitoring with Personas

Persona-driven, tool-less AI sessions that watch tab activity and surface suggestions inline or in dedicated reporting tabs.

### Starting a monitor

`monitor <persona> [target...]` starts a dedicated monitoring session. Without targets (inline mode), the monitor watches the owner tab and reports suggestions into its transcript. With explicit targets (tab labels or `group:<n>`) the suggestions appear in a persona-named reporting tab colored after the monitored tab.

### Transcript access

When a monitor starts, it receives the full existing transcript of every target tab — not just entries that arrive after the monitor starts. Inline monitors receive the owner tab's own transcript. External monitors receive the transcripts of all specified tabs and all members of specified groups. Entries appear in the order they were logged, giving the monitor full historical context from the moment it starts.

A **harness-view target** (see [[harness]]) has no `LogEntry` transcript, so it instead contributes its latest **rendered screen** — the same de-ANSI'd screen text `harness capture` writes. That screen is seeded at monitor start and refreshed on each 30-second flush, but only when it has changed since the last one fed (deduped by capture time), so an idle harness contributes nothing and never re-prompts the monitor. The monitor therefore sees periodic screen snapshots of a harness, not its full linear scrollback. SSH harness tabs have no screen reader and remain unwatchable.

### Flush cycle

New transcript entries from target tabs (including the initial historical entries) are buffered and flushed to the monitor's ACP session every 30 seconds as a single batch prompt. No prompt is sent when the buffer is empty or when a previous prompt is still streaming.

### Suggestions

Monitor suggestions are parsed from the ACP reply and delivered either inline (prefixed with the persona name and a sparkle indicator in the owner's transcript) or to the persona's reporting tab feed. Clicking a suggested command in the reporting tab runs it in the tab the suggestion is about, queuing behind that tab's other queued commands if it is currently busy (see [[agent-command-queue]]). Suggestions from monitors are excluded from other monitors' feeds.

### Asking a monitor

`monitor ask <persona> <question>` sends a direct question to a running monitor's session, bypassing the batch buffer. The reply lands in the owner tab's transcript. Only one question or flush may be in flight at a time per monitor.

### Rating

Thumbs-up or thumbs-down on a reporting-tab suggestion feeds back to the monitor through its normal batched prompt channel. Either direction removes the rated suggestion from the feed, since rating means the user is done with it.

### Lifecycle

A monitor's session is killed when its `monitor stop` command runs, when its owner tab closes, or when all of its targets have been removed. A reporting tab stays open as long as at least one monitor feeds it (potentially from a different owner tab).
