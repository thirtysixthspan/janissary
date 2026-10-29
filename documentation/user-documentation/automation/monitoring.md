# Monitoring with personas

<img class="agent-float" src="/agents/aslan-south.png" alt="" />

`monitor` starts a persona-driven AI session that watches tab activity and surfaces suggestions, either inline in the tab you started it from or in a dedicated reporting tab:

```
monitor security bilal
monitor activity group:2
```

Monitors are tool-less by default and receive no filesystem or terminal access. See Persona web tools below for the one narrow exception.

This periodic monitor is separate from the autonomous-agent monitor view, where agent messages render as Markdown. See [Read formatted Markdown in the transcript](/user-documentation/advanced-agents/markdown-rendering#read-autonomous-agent-activity).

## Inline vs. reporting-tab mode

`monitor <persona> [target...]` behaves differently depending on whether you give it targets:

- **No targets (inline mode)**: the monitor watches the tab you started it from and posts suggestions into that shell’s visible output and shared activity log, prefixed with the persona name and a sparkle.
- **One or more targets (reporting-tab mode)**: the monitor watches the named tabs (or groups) instead, and its suggestions go to a dedicated reporting tab, colored after the tab(s) it watches.

A target is a tab label or `group:<n>`. A tab may also be named by its display alias (see [`rename`](/user-documentation/command-bar/commands)), matched case-insensitively; `unmonitor`'s target argument works the same way. Once the monitor's session connects, the owner tab's transcript shows the monitor's connection, such as its provider and model, and a one-sentence summary of the persona's role.

## How a monitor is named

The persona name is also the monitor's name. For example, `monitor security bilal` starts the `security` monitor, and you use `security` with `unmonitor` and `monitor ask`. The command has no separate monitor-name argument.

You can start a given persona only once from one tab. Starting it again from that tab reports `Already monitoring as "<name>".` Starting it from another tab creates another monitor; external monitors with the same persona share a reporting tab.

`Tab` completion follows the same split: `monitor` completes persona names, while `unmonitor` and `monitor ask` complete the names of monitors actually running from the current tab.

## The reporting tab

<img class="agent-float left" src="/agents/bilal-south-east.png" alt="" />

A reporting-mode monitor's tab carries a metadata line above its suggestion feed: the monitor's name, its persona when that differs from the name, the tab(s)/group(s) it watches, and the total size sent to and received from its session so far (shown in bytes/kilobytes/megabytes). Its dot and left border use the first target's tab color; for a group target, they use that group's color. Two buttons sit at the right of the metadata line:

The reporting tab gutter has an up/down-arrow button at the right. Drag it vertically to resize
the reporting area: drag up for more reporting space, or down for more main-tab space.
Neither the reporting area nor the main tab area can shrink below 15% of the window height.

Drag a monitor tab's label within the strip to reorder the reporting tabs. The selected monitor stays visible after the move, and reordering never changes the active tab in the main tab area.

- A **reset** button starts a fresh session with just the persona priming. It resets the context-size counter but leaves suggestions in the feed. The monitor also starts a fresh session automatically after a prompt error.
- A **context snapshot** button opens the accumulated context in an editor tab. It starts with the persona priming, then lists each batch or direct question and its reply in order. Markers show which blocks were sent to the model and which came back from it. The snapshot is fixed when you open it; click again for a newer one.

If two owner tabs share one reporting tab (the same persona started from two different tabs), resetting it resets every monitor feeding that tab.

## What a monitor sees

A monitor receives each target's **full existing history** the moment it starts, not just activity from then on:

- A shell tab feeds its application transcript in order; native zsh scrollback is not an application transcript.
- A harness tab feeds its normalized session transcript first, then its latest on-screen text. The transcript includes subagent activity and arrives in history order; the screen follows so the monitor can see current interactive state such as a permission prompt, spinner, or TUI panel. Each flush adds only new transcript entries. An SSH tab has no session transcript, so it feeds only its latest on-screen text, when that screen changes. These feeds contain text, not the raw terminal recording.
- An editor tab feeds its live buffer, including unsaved edits. Its first feed is the full content. Later feeds are unified diffs, sent only after the content changes.
- A page tab feeds only the text currently visible in its viewport, not the whole page. Its first feed is that text; later feeds are diffs, sent only when the visible text changes. This needs the bundled browser extension; see [Embedded web pages](/user-documentation/tab-types/web-pages#what-the-app-reads-from-a-page).

Editor and page content, and each harness session-transcript batch, are capped at 20,000 bytes per entry. A longer entry ends with a truncation note. Harness screens are a separate feed: decorative borders and spinner marks are stripped, then adjacent blank or duplicate lines are collapsed.

Group membership is re-checked continuously, so a tab that joins a monitored group later is picked up without restarting the monitor.

Content from monitored tabs is treated as data, not as instructions to the monitoring persona. This keeps text from a file, web page, harness, or transcript from changing what the persona was asked to do.

## The flush cycle

New activity from every target is buffered and sent to the monitor's session as a single batch prompt every 30 seconds. Nothing is sent when the buffer is empty or a previous prompt is still in flight.

## Suggestions and summaries

<img class="agent-float" src="/agents/cavus-south-west.png" alt="" />

A monitor's reply is parsed for two possible marker lines: `[SUMMARY]:` recaps activity with no action attached, and `[SUGGESTION]:` offers something actionable, optionally paired with a `[COMMAND]:` line. Marker text can continue across multiple lines. If a reply includes both markers, the suggestion is delivered and the summary is ignored. A reply with neither marker (like a bare `OK`) delivers nothing.

In a reporting tab, a suggestion that carries a command shows it as a clickable line: clicking dispatches it immediately to the tab the suggestion is about, even while that tab is busy. It does not wait behind that tab's queued work. Each suggestion also carries thumbs-up / thumbs-down buttons. Either rating removes the suggestion and sends the monitor feedback with its next batch prompt. What one monitor reports never lands in another monitor's feed.

## Asking a monitor directly

`monitor ask <name> <question>` sends a question straight to a running monitor's session, skipping the batch buffer. The reply lands in the owner tab’s activity log and appears in its shell output.

Only one direct question or scheduled flush can be in flight for a monitor at a time. If it is busy, wait and try again.

## Persona web tools

A monitor has no tools by default. A persona file can opt into `web_search` and `web_fetch` with a second directive line:

```
[//]: # claude:Sonnet:high
[//]: # tools: web_search, web_fetch
```

These are the only tools a persona can request. Both `claude` and `opencode` persona adapters are supported. The app grants an opted-in web tool only when the ACP session requests permission for it; it denies other tools, including filesystem and terminal access. A persona naming an unsupported tool fails to load with `Persona "<name>" requests unknown tool "<x>" (supported: web_search, web_fetch).`.

## Stopping a monitor

```
unmonitor security          stop the monitor named "security" started from this tab
unmonitor security bilal    stop watching bilal but keep security watching its other targets
unmonitor --all             stop every monitor started from this tab
monitors                    list active monitors with their targets and suggestion counts
```

Use `unmonitor <name> <target>` to remove one tab or group from an external monitor. It keeps running if other targets remain; removing its final target stops it. A target can be a tab label, display alias, or `group:<n>`. If the target does not match one the monitor watches, the monitor stays unchanged. Closing the owner tab stops its monitors. Closing a reporting tab stops every external monitor feeding it.

None of this survives a restart: a monitor's session is a live process, and its reporting tab is a live view, so both are gone. Start them again from the tab that owned them, or from a [profile](/user-documentation/automation/profiles) whose runscript starts them.

If two owners have external monitors for the same persona, they share one reporting tab. Closing one owner stops only its monitor; the reporting tab remains while the other owner still feeds it. It closes when the last monitor feeding it stops.

A reply or error that turns up after its monitor was stopped, or after its session was replaced by a reset or automatic recovery, is ignored. It doesn't add a suggestion or restart a stopped session. `monitor ask` is the one exception: a late reply still completes the running `monitor ask` entry, so the command bar isn't left waiting. The replaced session still isn't restarted.
