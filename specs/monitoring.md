# AI Monitoring with Personas

Persona-driven AI sessions that watch tab activity and surface suggestions inline or in dedicated reporting tabs. Monitors are tool-less by default; a persona may opt into a small fixed set of web tools (see Persona web tools below).

### Starting a monitor

`monitor <persona> [target...]` starts a dedicated monitoring session. Without targets (inline mode), the monitor watches the owner tab and reports suggestions into its transcript. With explicit targets (tab labels or `group:<n>`) the suggestions appear in a persona-named reporting tab colored after the monitored tab.

Once the monitor's ACP session connects, the owner tab's transcript shows a line naming the monitor, its connection (provider/model), and a one-sentence summary of the persona's role — before any suggestion has been produced.

### Reporting tab metadata

An external-mode monitor's reporting tab carries a metadata line above its suggestion feed, styled like the file navigator's and notifications tab's headers: the persona name, the tab(s)/group(s) it monitors (e.g. `agent2, group:3`), and the total size of everything sent to and received from its dedicated ACP session so far, shown in bytes/kilobytes/megabytes. The size grows with every flush and every direct question (`monitor ask`), and resets when the session is respawned after an error, since a fresh session starts a fresh context. Dropping one of several tab targets updates the target list shown; inline monitors have no reporting tab and so show no metadata line.

The metadata line's right-floated reset button discards the accumulated conversation on the monitor's dedicated ACP session and reloads just its persona context — the same recovery the monitor already performs automatically after a prompt error, now available on demand. When two owners share one reporting tab (two different agent tabs monitored by the same persona), resetting it resets every monitor feeding that tab, not just one.

### Transcript access

When a monitor starts, it receives the full existing transcript of every target tab — not just entries that arrive after the monitor starts. Inline monitors receive the owner tab's own transcript. External monitors receive the transcripts of all specified tabs and all members of specified groups. Entries appear in the order they were logged, giving the monitor full historical context from the moment it starts.

A **harness-view target** (see [[harness]]) has no `LogEntry` transcript, so it instead contributes its latest **rendered screen** — the same de-ANSI'd screen text `harness capture` writes. That screen is seeded at monitor start and refreshed on each 30-second flush, but only when it has changed since the last one fed (deduped by capture time), so an idle harness contributes nothing and never re-prompts the monitor. The monitor therefore sees periodic screen snapshots of a harness, not its full linear scrollback. SSH harness tabs have no screen reader and remain unwatchable.

### Flush cycle

New transcript entries from target tabs (including the initial historical entries) are buffered and flushed to the monitor's ACP session every 30 seconds as a single batch prompt. No prompt is sent when the buffer is empty or when a previous prompt is still streaming.

### Suggestions

Monitor suggestions are parsed from the ACP reply and delivered either inline (prefixed with the persona name and a sparkle indicator in the owner's transcript) or to the persona's reporting tab feed. Clicking a suggested command in the reporting tab runs it in the tab the suggestion is about, queuing behind that tab's other queued commands if it is currently busy (see [[agent-command-queue]]). Suggestions from monitors are excluded from other monitors' feeds.

### Persona web tools

By default a monitor can use no tools: `connectAcp`'s permission handler (`src/acp.ts`) denies every tool-permission request. A persona may opt into a fixed allowlist — currently only `web_search` and `web_fetch` — by adding an optional second config line to its file, in the same `[//]: #` comment style as the harness directive:

```
[//]: # claude:Sonnet:high
[//]: # tools: web_search, web_fetch
```

The list is comma-separated, case-insensitive, and de-duplicated; an empty or absent line means no tools (unchanged from before). An unknown tool name fails the persona load with `Persona "<name>" requests unknown tool "<x>" (supported: web_search, web_fetch).`. Only these two web tools are ever grantable — no filesystem, terminal, or generic HTTP tool is routed through this mechanism.

Enforcement stays in the permission handler: a request is approved only when the requested tool classifies (`classifyTool` in `src/acp-tools.ts`) as an allowed web tool, and denied otherwise. The allowlist is authoritative only for a harness that actually asks for permission through ACP (the `claude` adapter); enabling web tools on the `opencode` harness is not yet supported.

Because the opt-in lives in the persona file (a reviewable, checked-in diff, not a runtime toggle) and monitors receive full target transcripts, granting `web_fetch` is a real trust decision — a fetch-enabled persona could place transcript content into an outbound request. Keep the allowlist to the two web tools and enable them only on personas that need to look things up.

### Asking a monitor

`monitor ask <persona> <question>` sends a direct question to a running monitor's session, bypassing the batch buffer. The reply lands in the owner tab's transcript. Only one question or flush may be in flight at a time per monitor.

### Rating

Thumbs-up or thumbs-down on a reporting-tab suggestion feeds back to the monitor through its normal batched prompt channel. Either direction removes the rated suggestion from the feed, since rating means the user is done with it.

### Lifecycle

A monitor's session is killed when its `monitor stop` command runs, when its owner tab closes, when all of its tab targets have been removed, or when its own reporting tab is closed directly. A reporting tab stays open as long as at least one monitor feeds it (potentially from a different owner tab); once the last one stops, the reporting tab closes too, and the same owner/persona combination can be started again.

### Keyboard focus

The reporting section can receive keyboard focus via section navigation (see
`keyboard-navigation.md`), which focuses the currently-selected monitor without changing the
server's active tab.
