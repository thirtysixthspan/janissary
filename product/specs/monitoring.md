# AI Monitoring with Personas

Persona-driven AI sessions that watch tab activity and surface suggestions inline or in dedicated reporting tabs. A persona names a role on its first line, and any web access it has comes from that role's grants rather than from the persona file (see Persona web tools below).

### Starting a monitor

`monitor <persona> [target...]` starts a dedicated monitoring session. Without targets (inline mode), the monitor watches the owner tab and reports suggestions into its transcript. With explicit targets (tab labels or `group:<n>`) the suggestions appear in a reporting tab named after the monitor and colored after the monitored tab. A tab target may be given by its display alias (see `rename`) as well as its underlying label, matched case-insensitively; `unmonitor`'s target argument recognizes an alias the same way.

A monitor runs on the owner tab's core ACP connection under the persona's role (see [[acp]]), so it opens no session of its own to announce. The tab's connections window shows that core `acp:<role>:<provider/model>` row, and the monitor is addressed by its runtime name, which has a name-only `monitor:<name>` handle there.

### Naming a monitor

A monitor has a **name**, and that name is what everything addresses it by: it is the reporting tab's label, what `unmonitor` and `monitor ask` take, what the `monitors` listing and the connections row show, and what the reporting tab's header leads with. Starting one with `monitor <persona>` names it after the persona, so for a monitor started that way the two words are the same and only one is shown.

Names are unique per owner tab. Two monitors started from the same tab may share a persona as long as their names differ, and starting a second monitor under a name already in use from that tab is refused, naming the name rather than the persona. Completion follows the same distinction: `monitor <persona>` offers persona names, because that argument chooses a persona to start, while `unmonitor` and `monitor ask` offer the names of monitors actually running from the current tab.

### Reporting tab metadata

An external-mode monitor's reporting tab carries a metadata line above its suggestion feed, styled like the file navigator's and notifications tab's headers: the monitor's name, its persona where that is a different word, the tab(s)/group(s) it monitors (e.g. `agent2, group:3`), and the total size of everything sent to and received through the owner tab's core role connection on the monitor's behalf so far, shown in bytes/kilobytes/megabytes. The size grows with every flush and every direct question (`monitor ask`), and resets when the monitor's context is reset from the reporting tab, since a fresh context starts a fresh exchange. Dropping one of several tab targets updates the target list shown; inline monitors have no reporting tab and so show no metadata line.

The metadata line's right-floated reset button closes the owner tab's core ACP session for the persona's role and starts the monitor's context over: the next flush re-sends its first prompt on a fresh session, on demand. When two owners share one reporting tab (two different shell and harness tabs monitored by the same persona), resetting it resets every monitor feeding that tab, not just one.

The metadata line also carries a right-floated context button that opens a point-in-time snapshot of the monitor's current context — the actual accumulated content whose size the byte counter reports — in a text tab. The snapshot is the ordered context the monitor has built up: its persona priming followed by every batched update, direct question, and reply. Each block is wrapped between a pair of markers that delineate its direction — one immediately before and one immediately after its content — whether it was sent to the model (persona priming, batched updates, direct questions) or is a response received from the model (a reply) — so the two are visually distinct rather than an undifferentiated run of text. It opens as a normal editor tab, so it scrolls with the arrow keys, Page Up/Down, and the mouse wheel. It is a snapshot, not a live view: it reflects the context as of the moment the button was clicked, and clicking again opens a fresh snapshot. When two owners share one reporting tab, the snapshot is of the monitor feeding that tab.

### Reporting area resizing

The reporting tab gutter has a single right-aligned up/down-arrow resize button. Dragging the
button vertically changes the reporting area's height; dragging up gives the reporting area more
space and dragging down gives the main tab area more space. Neither area can shrink below 15% of
the viewport height.

The reporting strip can be reordered by dragging a monitor tab label within the strip. The selected
monitor remains visible after the move, and reordering reporting tabs does not change the active tab
in the main tab area.

### Transcript access

When a monitor starts, it receives the full existing transcript of every target tab — not just entries that arrive after the monitor starts. Inline monitors receive the owner tab's own transcript. External monitors receive the transcripts of all specified tabs and all members of specified groups. Entries appear in the order they were logged, giving the monitor full historical context from the moment it starts.

Group membership is re-checked continuously, not just at start: a tab created later that joins a monitored group (by inheriting that group from its creator) is included from that point on, without restarting the monitor.

A **harness-view target** (see [[harness]]) has no `LogEntry` transcript, so it instead contributes its latest **rendered screen** — the same de-ANSI'd screen text `harness capture` writes, further **compressed** for the monitor: decorative TUI chrome (box-drawing borders, spinner glyphs) is stripped, and the blank or duplicate lines that stripping leaves behind collapse to a single line, so this feed is no longer necessarily byte-identical to what `harness capture`/`harness transcript` show a human. That screen is seeded at monitor start and refreshed on each 30-second flush, but only when it has changed since the last one fed (deduped by capture time), so an idle harness contributes nothing and never re-prompts the monitor.

A harness target also contributes its **session transcript** (see [[harness-recording]]) — the linear history extracted from the harness's own session record, in normalized text. Each flush carries whatever entries have accumulated since that monitor's previous one, size-capped as one batch with a trailing truncation note, and ordered before that tab's screen snapshot, so a flush reads as history followed by current state. This includes **subagent** activity — a subagent's own prompts, tool calls, and results — which never renders on the parent's terminal and so can never appear in a screen snapshot. Cursors are per monitor, so two monitors watching one tab each receive the whole stream, and a monitor started mid-session receives everything the tab has accumulated since it opened.

The two feeds are deliberately additive: the screen is the only thing showing a harness's *current interactive state* (a permission prompt awaiting an answer, a spinner, a TUI panel), which the session record does not carry until the turn resolves; the transcript is the only thing carrying the linear history and the subagent detail. For a tab whose session record cannot be found, only the screen snapshots arrive, exactly as before — the monitor then sees periodic screen snapshots of a harness, not its full linear scrollback. SSH tabs are watchable the same way, since they share the harness-view tab shape, and contribute screen snapshots only — they run no harness and have no session record.

An **editor-view target** (see [[editor-tab]]) also has no `LogEntry` transcript, so it instead contributes its current content, checked at monitor start and again on each 30-second flush, but only fed when it has changed since the last check. The first feed to a given monitor is the full current content; every feed after that is a size-capped **unified diff** against what was last fed to *that* monitor, so a monitor watching a large file accumulates roughly one edit's worth of change per flush rather than the whole file each time. Any single entry — the first full-content one included — is truncated with a trailing note if it would exceed the cap. The content a monitor sees is the editor tab's **live buffer**: whenever the tab has unsaved edits, the monitor is fed the in-progress draft the editor syncs to the server shortly after typing pauses (see [[editor-tab]]), so unsaved changes are visible without a save. When the buffer has no unsaved edits, the content is read from the saved file on disk. A save, an external on-disk change, and ongoing typing are therefore all picked up by the next flush; a file deleted from disk (with no unsaved buffer) feeds a diff that removes every line.

This periodic, batched delivery into a reporting tab is distinct from an editor tab's own in-editor persona-suggestion request (see [[editor-tab]] → "In-editor persona suggestions"), which fires a single-shot query directly from the buffer and applies its answer inline — both read the same live buffer, but only the reporting-tab flow above goes through a monitor's flush cycle.

A **page tab target** (see [[embedded-web-page]]) also has no `LogEntry` transcript, so it instead contributes only the text currently **visible in its viewport** — not the full page — checked at monitor start and again on each 30-second flush, but only fed when it has changed since the last check. The first feed to a given monitor is the full current visible text; every feed after that is a size-capped unified diff against what was last fed to *that* monitor, the same shape as the editor-view feed above. Content is captured by the app's bundled browser extension, which relays what is actually rendered on screen (accounting for scroll position and window size) — text that is off-screen or hidden by CSS never appears. A page tab whose content has not yet been captured contributes nothing until the first capture arrives. This only works under the app's managed-Chrome launch, not the system-default-browser fallback, since the extension must be loaded into the browser instance.

Every target's fed content — ACP response entries, harness screens, harness session transcripts, editor diffs, and page text alike — is wrapped in a random delimiter unique to that monitor's session when a flush prompt is assembled, and the persona is primed once at session start to treat anything between those markers as data from a monitored target, never as instructions. This defends against a monitored target's content trying to override the persona's own instructions (an indirect prompt injection); a page tab is the target most likely to carry adversarial content, since the app has no control over what a third-party site renders, but the same framing applies uniformly to every target type. It matters for a harness session transcript too, which carries verbatim file contents and tool output. This framing does not extend to `monitor ask` questions or their replies, which are user-authored, not monitored-target content.

### Flush cycle

New transcript entries from target tabs (including the initial historical entries) are buffered and flushed to the owner tab's core ACP connection under the persona's role every 30 seconds as a single batch prompt. No prompt is sent when the buffer is empty or when a previous prompt for that role is still running.

### Suggestions

A monitor's reply is parsed for one of two deliverable reports, using explicit marker lines: a `[SUMMARY]:` line recaps activity (what a harness or web page is doing) and carries no command, while a `[SUGGESTION]:` line offers an actionable suggestion and may be accompanied by a `[COMMAND]:` line. When both markers appear, the actionable suggestion wins. A reply with neither marker (e.g. the single word `OK`) delivers nothing. This lets a persona that watches an autonomously-working harness surface running summaries into its feed rather than being forced to phrase everything as a suggestion or fall silent. A marker's text may span multiple lines — everything after the marker is delivered verbatim up to the next marker line or the end of the reply, so a summary or suggestion that continues onto further lines (e.g. a list of bullet points) is delivered in full, not just its first line.

Both summaries and suggestions are delivered the same way — either inline (prefixed with the persona name and a sparkle indicator in the owner's transcript) or to the persona's reporting tab feed. Clicking a suggested command in the reporting tab runs it in the tab the suggestion is about, dispatching immediately even if the agent is busy. Reports from monitors are excluded from other monitors' feeds.

### Persona web tools

A persona's first line is a role directive, `[//]: # role:<name>`, naming the role whose core ACP connection the monitor uses on its owner tab. Every shipped persona names the `ask` role. A first line that omits the directive fails to load with `Persona "<name>" has no role directive. First line must be: [//]: # role:<name>.`; one with an empty role name fails with `Persona "<name>" has a malformed role directive.`. The launcher summarizer's own reader uses the same directive and reports a missing one as `ai/personas/launcher/summarizer.md has no role directive. First line must be: [//]: # role:<name>.`.

A named role must exist and have a usable model. An unknown one fails with `Unknown role "<role>" in persona "<name>".`, and one whose entries are empty or all disabled fails with `ACP: the <role> role lists no models.`; either failure stops the monitor before any connection is opened.

Web access comes from the role's `commands`, not from a line in the persona file. The default `ask` role grants `web search` and `web fetch`, so a persona naming `ask` can look things up on the web; a persona whose role grants no web commands has no web access. There is no tools line to configure in a persona file.

Because monitors receive full target transcripts, the web access a role grants is a real trust decision — a persona with `web fetch` could place transcript content into an outbound request. Grant web commands only to roles whose personas need to look things up.

### Asking a monitor

`monitor ask <name> <question>` sends a direct question to a running monitor through the owner tab's core role connection, bypassing the batch buffer. The reply lands in the owner tab's transcript. Only one question or flush may be in flight at a time per monitor.

### Rating

Thumbs-up or thumbs-down on a reporting-tab suggestion feeds back to the monitor through its normal batched prompt channel. Either direction removes the rated suggestion from the feed, since rating means the user is done with it.

### Lifecycle

A monitor ends when `unmonitor <name>` stops it, when its owner tab closes, when all of its tab targets have been removed, or when its own reporting tab is closed directly. Stopping releases its periodic updates and activity subscriptions along with its accumulated context, leaves the tab's core role session alone, and removes the monitor from the active list. The same owner/name combination can then be started again.

A reply or error that arrives after its monitor was stopped, or after a reset began a fresh context, is ignored. It restarts nothing, delivers no suggestion, reopens no reporting tab, and writes no `monitor <persona>: … — restarting monitor session` line. Stopping a monitor mid-prompt leaves the tab's core role session alone for any other consumer; it never leaves an untracked monitor process running, and a reset during an update starts the context over once, not twice. The one exception is `monitor ask`: its late reply or error still closes the owner tab's running `monitor ask` entry with the text it would otherwise show, so the command bar is never left waiting, but nothing is restarted.

Removing one target from an external monitor keeps its remaining targets active and updates the reporting tab's target list without resetting its accumulated context size. A target that matches none of the monitor's targets leaves it running unchanged. Removing the final target stops the monitor.

A reporting tab stays open while another owner's external monitor with the same name still feeds it; once the last one stops, the reporting tab closes too. Inline monitors and monitors with other names do not keep that reporting tab open, even if they use the same persona. Stopping an inline monitor never closes a reporting tab.

### Keyboard focus

The reporting section can receive keyboard focus via section navigation (see
`keyboard-navigation.md`), which focuses the currently-selected monitor without changing the
server's active tab.

Inline suggestions and monitor-question replies carry stable background delivery IDs. The shell renders completed replies into its visible output, deduplicates repeated snapshots, and replays retained replies after reconnecting. Native zsh input is not modified. Reporting-tab delivery remains unchanged.
