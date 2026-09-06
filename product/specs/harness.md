# Harness Tab

A **harness tab** opens an AI coding harness (claude, opencode, or codex) as the entire tab body —
a live PTY terminal that takes over the tab in place of the usual transcript and command bar. An
**ssh tab** (opened via `ssh <destination>`) is a harness-view tab of the same shape, running a
real `ssh` session instead of an AI harness — see SSH Tab for its own command grammar, connections
row, and the one place its behavior differs (the connections panel is shown, not suppressed).

## Command

```
harness <name> [as <label>] [on <address>] [-w] [-y] [-b] [--model <name>] [--effort <level>] [with <prompt>]
```

Valid names: `claude`, `opencode`, `codex`. The binary must be on `PATH`; if it is not found, the
PTY exits immediately and the tab closes (see [Lifecycle](#lifecycle)). See
[Launching with a model and effort level](#launching-with-a-model-and-effort-level) for `--model`
and `--effort`.

Claude harnesses launch with `DISABLE_AUTOUPDATER=1`, so Claude Code does not attempt to update
itself during a Janissary session. This applies to direct launches and harnesses opened from a
profile; other harness types are unchanged.

- `harness` with no name — opens the **New harness** launch dialog (see [New harness launch dialog](#new-harness-launch-dialog) below), not an error.
- `harness foo` — error: `Unknown harness "foo". Choose from: claude, opencode, codex.`

### New harness launch dialog

Typing `harness` with no arguments — from a tab that has a command line — opens a modal **New harness**
dialog over the command bar instead of returning a usage error. The dialog is a small form for
choosing the harness and its launch flags with controls rather than typing the command by hand. It
offers: a harness selector (claude, opencode, codex), a **Label** field (the `as <label>` name), a
**Workspace** toggle (`-w`), an **Offline** toggle (`--offline`), an **E2E browser** toggle (`-b`),
an **Auto-approve** toggle (`-y`), a **Model** dropdown, and an **Effort** dropdown.

The form enforces the flag constraints so it can only ever build a valid command: **Auto-approve** is
disabled unless the selected harness is claude or codex — switching between those two keeps its
checked state, while switching to opencode clears and disables it — while **E2E browser** stays
enabled for every harness, since none rejects it. The **Model** dropdown lists
the selected harness's known models and is disabled when that harness has no model catalog. The
**Effort** dropdown offers a default (no `--effort` flag) plus the fixed levels `low`, `medium`,
`high`, `xhigh`, and `max`. Opening the dialog records no line in the transcript.

Pressing **Create** launches the harness tab immediately — it synthesizes the equivalent
`harness <name> …` command and submits it through the normal command path, so all the usual parsing,
validation, workspace/sandbox setup, and creator-transcript recording happen exactly as if the
command had been typed. **Cancel** or **Escape** closes the dialog with nothing launched. The
dialog's selections are remembered in memory for the rest of the app run (reopening restores them);
they are never persisted to disk or restored across `--relaunch`. When the dialog reopens with
remembered settings, keyboard focus lands on **Create** so hitting Return relaunches immediately;
a fresh dialog (no prior settings yet this run) keeps focus on the dialog itself. Only the bare `harness` command
opens the dialog — every other form (`harness claude`, `harness claude -w`, `harness capture <name>`,
…) still acts directly, and harness tabs, which have no command line, have no way to open it.

Before the harness tab opens, the `harness <name> [as <label>] [-w]` command itself is recorded
in the **creator's** transcript — the tab `harness` was run from, not the new harness tab (which
has no transcript of its own). This happens synchronously ahead of the PTY spawn, so the launch
is always visible even if the harness exits — and its tab closes — immediately after.

### Custom tab label (`as <label>`)

By default a harness tab's label is the harness name (`claude`, `opencode`, `codex`), disambiguated
with `-2`, `-3`, … if that label is already in use. `as <label>` overrides this with an arbitrary
label instead, still disambiguated the same way if it collides with an existing tab:

```
harness opencode as quality   → tab "quality" running opencode
harness opencode as quality   → tab "quality-2" running opencode (label already taken)
```

The harness identity (`name`, the binary launched) is unaffected by `as` — only the tab's label
and title change. `as` and `-w`/`--workspace` may be combined in either order:

```
harness opencode as quality -w
```

- `harness claude as` (no label after `as`) — error: `Usage: harness <claude|opencode|codex> as <label>.`

### Workspace default and opt-out

Harnesses clone the root repository (detected from the current directory) into
a disposable workspace named after the harness tab's unique label, identically to `agent --workspace`:

```
harness claude -w    → tab "claude"   with workspace at .janissary/workspace/claude/
harness claude -w    → tab "claude-2" with workspace at .janissary/workspace/claude-2/
```

`-w`/`--workspace` explicitly confirms this default. `--no-workspace` starts in the current project
checkout instead and wins if both forms are present. The harness PTY starts in the workspace directory. The workspace is removed when the tab is closed —
the tab closes immediately and the clone is deleted in the background, so closing a harness tab with
a large workspace never freezes the UI. If no git repository is found from the current directory, an
error is shown and no tab is created.

**The tab appears immediately; the clone runs in the background.** Cloning a large repository can
take a while, but the app never blocks on it: the harness tab opens right away with no terminal
content (`status: 'provisioning'`), the rest of the app stays fully responsive — other tabs keep
working, more commands can be run — and the terminal takes over once the clone finishes and the
harness process starts. Closing the tab before the clone finishes cancels it and closes the tab
immediately, the same as closing any other harness tab. If the clone fails (network error, no
`origin` remote, etc.), the failure is shown in place of the empty terminal and the tab closes on
its own shortly after — see [Harness tab data](#harness-tab-data).

On macOS, the harness process is additionally confined to the workspace by a Seatbelt sandbox — see
[[sandbox]] and [[workspaced-agent]].

### Remote host (`on <address>`)

Adding `on <address>` runs the harness on another host over one ssh session, in a workspace that
host provisions from its own project root:

```
harness claude on devbox                  → tab "claude" running on devbox
harness claude as build on admin@devbox:/srv/proj
```

The clause implies `-w`, so `harness claude on devbox` and `harness claude -w on devbox` are the same
command, and no local clone is made. The tab opens immediately showing the live ssh session, so
authentication prompts are answered by typing into it; once the remote workspace is ready the harness
takes the terminal over and the tab behaves exactly like a local one, apart from a host chip at the
left of its metadata row. A remote tab's clone lives on the remote and is removed there, and if the
ssh session ends the tab closes. See [[remote-server]] for the address grammar, the bootstrap
requirement, the failure set, and the connections rows.

### Auto-approve permissions (`-y` / `--yes`)

Claude and codex harnesses auto-approve permission prompts by default. `-y`/`--yes` explicitly
confirms that default, while `--no-auto-approve` opts out and wins if both forms are present. When auto-approval is active and the harness raises a
blocking permission prompt, the app recognizes the prompt and answers it automatically instead of
waiting for the user. Because the harness is confined to a disposable workspace clone (and, on
macOS, a sandbox), auto-approving its prompts stays low-risk — see [[workspaced-agent]].

The flag is supported for **claude and codex**:

- `harness opencode -y` (or any harness without a recognized permission prompt) — error: `-y/--yes is only supported for the claude and codex harnesses.`

Auto-approval does **not** require a workspace. Launching `harness claude --no-workspace` without also opting out of auto-approval
succeeds, but since there is then no disposable clone (and, on macOS, no sandbox) confining the
harness, a security warning line appears in the new tab's terminal: `auto-approve is on without a
workspace: prompts are approved unattended against your real files, with no sandbox confining the
harness`.

`-y` combines with `as <label>` and `-w` in any order. Support for opencode is future work.

For codex, the app recognizes codex's approval overlay by its structure rather than by broad
approval words: a request-specific title (the command-execution, network-access, file-changes,
permission-grant, or MCP-elicitation prompt), the highlighted first ordinary-approval option (its
one-time "Yes, proceed" / "Yes, just this once" / per-turn grant / first MCP approve choice —
never a persistent prefix, session, host, or file allowlist choice), and the confirm/cancel footer.
When that overlay is live, the app injects a single Enter to accept the highlighted option — the same
selected-row Enter contract as claude, not a literal `y` — and records the same `Auto-approved a
permission prompt` notification with a capture link. A gate-shaped menu that has scrolled above
codex's live input composer is treated as stale and not answered.

### End-to-end browser (`-b` / `--browser`)

A sandboxed harness cannot launch a browser of its own — the sandbox denies reads of the directory
Playwright keeps its Chromium in — so an AI working in a workspace has no way to see what a user
would see. `-b`/`--browser` closes that gap: Janissary starts a headless Chromium for the tab, on
whichever host the harness runs on, and gives the harness two environment variables:

- `JANISSARY_BROWSER_WS_ENDPOINT` — the endpoint to connect a Playwright client to.
- `JANISSARY_PLAYWRIGHT` — the path to Janissary's own Playwright client, so the client and server
  versions match by construction and a project that does not itself depend on Playwright can still
  drive the browser.

The AI writes its own script, connects to the endpoint, and drives a real browser against a real
page. What it points that browser at is its own work: it starts the workspace clone's build inside
the sandbox and navigates to that server. Janissary does not inject the live application's URL or
session token, and active workspace confinement blocks the normal route through the project's state
directory where those values are recorded. This reduces disclosure; it does not prove the live
session unreachable when Seatbelt is unavailable, `sandboxWorkspaces` is off, or the harness uses
`--no-workspace`. In those configurations the harness is not confined from discovering same-user
process, file, or listener state by other means. See Sandbox, especially "Where confinement does not
apply." The intended target remains the server built from the harness's own workspace. There is no
test runner and no pass/fail reporting — the two variables are the whole surface.

The browser is always headless, since the AI never needs to look at a window. Each `-b` tab gets its
own browser; browsers are never shared or pooled between tabs. The flag is accepted for every
harness, with or without a workspace, and combines with the other options in any order.

Handing an agent a browser endpoint would be a way out of the sandbox unless something stopped it,
so the browser is contained twice. The endpoint the agent receives belongs to a guard that inspects
the browser-control protocol and refuses `file:` URLs, ending the session rather than failing one
call. Behind that guard the browser itself runs in a fresh, empty scratch directory of its own — never
a copy of the project — and on macOS it is sandboxed to that directory, so a `file:` read that got
past the guard finds nothing worth having. On a host without macOS sandboxing, or with workspace
isolation switched off, the guard is the only layer that applies. See Sandbox for what each layer
allows.

`-b` with `--offline` is left contradictory on purpose: both flags apply, so the variables are set
and the offline profile then denies the harness any network route to reach its own browser. Neither
flag is rejected.

When the browser is gone — a launch that failed, a browser that exited, or a guard that died — a line
appears in the notifications tab naming the tab it belonged to. Nothing restarts it; a later attempt
to connect simply fails. As with every notification, a user with the notifications tab closed sees
nothing. Closing a `-b` tab stops its browser and removes its scratch directory — only that
browser's own directory, which no tab and no other browser shares.

A browser that ends on its own releases the same things at the moment it ends, rather than holding
them until its tab closes: the endpoint stops accepting connections, the browser process is gone,
and the scratch directory is removed. That holds for a launch that never got that far too — whatever
part of it had started is undone. The notification arrives once, after the release, and never for a
browser the user closed themselves.

The flag is available from all three launch surfaces: the `harness` command, the **E2E browser**
checkbox in the New harness dialog, and a `browser: true` field on a profile harness entry.

### Launch prompt (`with <prompt>`)

A trailing `with <prompt>` clause gives the new harness an initial prompt that is typed and
submitted into it once it is ready, so a launch and its first instruction happen in one command:

```
harness claude with fix the failing tests
```

The clause comes **after** every option — everything from the standalone `with` keyword to the end
of the line is the prompt, taken verbatim with its internal spacing preserved. Because the clause is
split off before options are read, words inside the prompt that look like flags or keywords
(`-w`, `as`, `--model`, …) are treated as prompt text, not parsed as options.

- `harness claude with` (no text after `with`) — error: `Usage: harness <claude|opencode|codex> [options] with <prompt>.` No tab is created.
- `harness claude` with no `with` clause launches an empty harness exactly as before.

The prompt is delivered by the same mechanism a profile's `run` entry uses: a single one-shot
schedule entry is attached to the new harness tab and fires as soon as the harness is running,
typing the prompt and submitting it. If the harness is not yet ready the delivery retries on later
ticks; if the tab never opens or exits first, the prompt is simply never delivered. Because
launching is an ordinary command, wrapping it in a `schedule` command runs the whole launch — fresh
harness plus injected prompt — at a future time (see [[scheduling]]).

How it works: the app watches the harness's rendered-screen text (not an image), captured about a
second after output settles. When that text shows claude's permission menu — the highlighted
`❯ 1. Yes` default followed by a final `2. No`/`3. No` option — the app injects the Enter keystroke
to accept the highlighted "Yes" (it is a numbered menu, so a literal `y` would not work) and records
an `auto-approve` notification, rendered as `<label>: Auto-approved a permission prompt` (see
[[notifications]]). Detection keys on the menu structure and on the absence of claude's live input
caret (its own `❯` prompt) below the options — an active gate replaces the input box, so the caret
is gone. This lets a gate be detected regardless of the passive chrome claude pins beneath it (the
footer hint, a task panel that pushes the options well above the bottom of the screen, status
lines), while gate-shaped text that has scrolled up and been superseded by claude's prompt — where
the input caret is back on screen — does not trigger an approval.

At the moment of a successful auto-approval, the app also saves the harness's on-screen text to a
file and attaches a clickable, outline-style clipboard-icon link before that same notification line's
text; clicking the link opens the captured text in an ordinary editor tab, so the user can review
exactly what was auto-approved after the fact. The capture file is written only when the notification is actually
recorded (the notifications tab is open), so no orphan files are left behind when the feed is closed. This link is
added only for successful auto-approvals — a prompt still awaiting the user, and the stand-down
"could not clear the permission prompt" case, get no capture and no link.

If an approved prompt does not clear (the same gate screen redraws unchanged), the app does not
re-send the keystroke; it records `<label>: Auto-approve could not clear the permission prompt;
standing down` once and leaves that gate alone until the screen changes. Auto-approval is in-memory
per launch — like the harness tab itself, it is never persisted or restored on `--relaunch`. As with
every notification, the `auto-approve` line is only recorded while the notifications tab is open.

A harness tab opened with `-y` shows the auto-permitting flag icon in its metadata row — see
Metadata row in `tabs.md`.

An ACP agent can separately ask the human a free-text or multiple-choice question by issuing a
`question ask` or `question approve` command. This human-answer channel is independent of harness
auto-approve and does not change how harness permission prompts are recognized or answered. See
[[agent-questions]].

## Harness tab data

A harness tab is distinguished by `view: 'harness'` and carries a **harness payload**:

- **name** — the harness identifier (`claude`, `opencode`, or `codex`).
- **program** — the binary that was launched.
- **ptyId** — the live PTY stream id used by xterm.js to attach; empty while `provisioning`.
- **status** — `running` while the process is alive. A `-w`/`--workspace` launch starts at
  `provisioning` instead, for as long as its workspace clone is still being created (see
  [Workspace flag](#workspace-flag--w----workspace) below) — the tab appears immediately with no
  terminal content, and moves to `running` once the clone finishes and the harness process starts.
  The tab is closed as soon as the process exits, so `exited` is not observed in normal operation.
- **exitCode** — would be set alongside an `exited` status; unused in practice since the tab
  closes before it could be read.
- **provisionError** — set only when a `-w` launch's workspace clone fails; shown in place of the
  empty terminal, and the tab closes automatically shortly after.

## Layout

A harness tab has **no command bar and no transcript**. When the active tab is a harness view, the
app renders the tab strip above a full-body terminal. Every other tab renders unchanged. Tab
switching continues to work via the tab strip or the Shift+←/→ chord.

## Focus

The xterm terminal is focused automatically in two cases:

- **On mount** — when the harness tab is first created, `term.focus()` is called so the terminal
  is ready for input immediately.
- **On tab switch** — when switching to a harness tab (via Shift+←/→, a tab-strip click, or
  `next`), the app focuses the harness terminal instead of the command-line input. Typing starts
  reaching the harness without any click.

Switching away from a harness tab restores the normal focus model (command-line input for agent
tabs; no special focus for image/page tabs).

## Input model

All keys, clicks, and mouse events are delivered to the harness **except**:

- **Shift+←/→** — the tab-switch chord, which bubbles to the window handler.
- Clicks on the tab strip — handled by the tab strip as usual.

Ctrl-combinations (`Ctrl+C`, `Ctrl+D`, `Ctrl+R`, `Ctrl+Z`, etc.) are sent to the harness.
Reorder/collapse chords (`Ctrl+←/→`, `Ctrl+T`) are **not** available while a harness is focused;
switch to another tab first.

**Shift+Enter** is translated before it reaches the PTY: instead of a bare carriage return
(which would submit), the terminal sends `ESC` + `CR` — the same sequence Alt/Option+Enter
produces in native terminals — which harnesses like claude read as a line continuation. This lets
multi-line prompts be composed in the harness without any harness-side terminal setup. This
applies to every xterm.js terminal in the app (harness tabs, interactive PTY takeover, terminal
cards).

## Tab strip

The tab's name in the strip is the tab's unique label — the harness name by default (`claude`,
`claude-2`, `claude-3`, …) or the custom `as <label>` if one was given — with no type marker
appended (per [[tab-label-no-markers]]). A **× close button** is shown in the strip (identical to
image/page view tabs). The tab's dot shows as **busy** while the harness is actively working and
stops blinking while it sits idle at its own prompt — see
[Busy/ready status](#busyready-status).

## Busy/ready status

The tab's blinking dot tracks what the harness is actually doing, not merely whether its process
is alive: it blinks while the harness is generating a response or running tools, and stops once
the harness returns to its own idle prompt. Recognition reads the same rendered-screen captures
taken for [screen capture](#screen-capture), plus the terminal title the harness sets, and each
harness has its own signal:

- **claude and codex** set an animated spinner glyph at the start of the terminal title while
  working; any other title means idle. When claude has set no title yet, its rendered screen is
  read instead: an `esc to interrupt` footer means working, a live input prompt means idle.
- **opencode** never signals through its title, so only its rendered screen is read: a progress
  bar or an interrupt hint (`esc interrupt`) means working; the absence of both means idle.

A newly launched harness tab starts busy, exactly as before, until its first capture is
classified. A working→idle transition is committed only after the idle reading holds across two
consecutive captures, so a brief mid-generation pause never flickers the dot off; a return to
working takes effect immediately.

Status changes show in the tab strip the moment they are recognized, whether or not the harness
tab is the active one — a backgrounded harness's dot starts and stops blinking live, without
switching to the tab first.

Once a hidden (backgrounded, undocked) harness tab's working→idle transition commits, the tab is
marked with the unread badge to call attention to it — the harness has either finished its current
run or is otherwise waiting, and the badge is what surfaces that without switching to the tab
first. A visible tab going idle is unaffected; only a hidden one is badged. One exception: for
claude, if the last thing it printed before returning to its own prompt was a `recap:`-prefixed
summary line, the transition is exempted from the badge — the busy dot still stops blinking, but a
recap alone is not treated as new information worth flagging.

When claude or codex shows a recognized permission prompt, the dot stops blinking immediately — the
harness is waiting on the user, not working — and if nothing is going to answer the prompt (the tab
was launched without `-y`, or auto-approve has stood down on a prompt it could not clear), the tab is
marked unread right away rather than waiting on the usual working→idle debounce. A permission prompt
in opencode simply reads as idle, with no distinct gate detection of its own — its prompt recognition
is future work, alongside its auto-approve support — but it still badges unread like any other
working→idle transition, so a hidden opencode tab stuck on an unanswered prompt is still surfaced,
just without the immediate (non-debounced) timing.

A harness without its own recognition signals keeps the previous coarse behavior — the dot blinks
for as long as the process is alive. All three launchable harnesses have signals today, so this
applies only to harnesses added later.

## Lifecycle

- **Created** by `harness <name>` — the command is first recorded in the creator's transcript,
  then a new tab is opened, focused, and the PTY starts.
- **Running** — the harness receives all input; the connections panel lists `terminal:<name>`.
- **Closed** — the tab closes as soon as the harness process exits, whether from the harness
  quitting normally, crashing, or the binary not being found on `PATH`. The tab's × button or
  `close` command closes it the same way while the process is still running (killing the PTY
  first). If the harness tab is the last remaining tab, closing it — including the harness
  process exiting on its own — quits the app (see `tabs.md`). There is no frozen "exited" state
  to inspect — the harness's own scrollback is gone once its tab closes, but the full timed session
  is preserved in its recording file, and its normalized history (including any subagent activity)
  in its transcript file (see [[harness-recording]]). Screen capture, recording, and transcript
  observers stop with the PTY and are not retained after the tab closes.

## Screen capture

```
harness capture <name>
```

Writes a point-in-time text capture of a harness tab's screen to a file and opens it in a normal
editor tab. `<name>` targets an **existing harness tab by its label** (matched exactly and
case-sensitively) — not a harness type — so `harness capture claude` captures the tab labeled
`claude` rather than launching anything.

- `harness capture` with no name — error: `Usage: harness capture <name>.`
- No tab has the label — error: `No tab labeled "<name>".`
- The tab exists but is not a harness tab — error: `"<name>" is not a harness tab.`
- The tab is a harness tab with nothing captured yet (no output has settled, or it is an ssh
  tab, which is never captured) — error: `No capture available for "<name>" yet.`

Captures are taken automatically while a harness produces output: about one second after output
resumes, the current screen contents (the visible rows only, at the terminal's real dimensions,
with trailing blank rows dropped) are recorded in memory, replacing the previous capture. A
harness that goes quiet is simply not re-captured — an idle, unchanged screen never produces new
captures — so the latest capture reflects the screen as of roughly one second after its last
burst of output.

Running the command writes that latest capture to `.janissary/captures/<label>-<timestamp>.txt`
in the project directory and opens it as a regular editor tab — each invocation writes a file and
opens a new tab; the capture is a snapshot, not a live view. Capture files accumulate only within
a run: the directory is cleared at the next normal launch (a `--relaunch` handoff preserves it,
matching agent state).

## Session transcript

```
harness transcript <name>
```

Opens a harness tab's **session transcript** — the linear session history extracted from the record
the harness binary keeps in its own configuration directory, normalized to plain text — in a normal
editor tab. `<name>` targets an **existing harness tab by its label** (matched exactly and
case-sensitively), exactly as `harness capture` does.

- `harness transcript` with no name — error: `Usage: harness transcript <name>.`
- No tab has the label — error: `No tab labeled "<name>".`
- The tab exists but is not a harness tab — error: `"<name>" is not a harness tab.`
- The tab is a harness tab whose transcript is not available — nothing has been extracted yet, the
  session record could not be found, or it is an ssh tab, which never has one — error:
  `No transcript available for "<name>" yet.`

Unlike a capture, the transcript is written continuously and automatically for the tab's whole life;
the command only opens the file. It is a point-in-time open of the file as it stands, not a live
view, so re-running it after more activity opens a newer version of the same growing file.

What the transcript carries that a capture cannot is **subagent** activity. When a harness dispatches
a subagent, the terminal shows only a collapsed progress line, so the subagent's own prompts, tool
calls, and results appear nowhere on screen; in the transcript they appear as ordinary entries,
labeled with the subagent that produced them. See [[harness-recording]] for the per-harness sources,
file naming, and the fallback when no session record can be found.

## Session recording

Separately from on-demand screen capture, every named-harness session is **automatically** recorded
to a replayable asciicast file under `.janissary/recordings/` for its whole lifetime — a *recording*
is the full timed output stream, where a *capture* is a single point-in-time screen snapshot. See
[[harness-recording]] for the file format, scope (ssh and inline PTYs excluded), lazy creation, and
replay.

## Monitoring

A harness tab can be a monitor target (`monitor <persona> <harness-label>`): since a harness has no
`LogEntry` transcript, the monitor is instead fed the tab's latest **rendered screen** on each flush.
SSH harness tabs have no screen reader, so they remain unwatchable. See [[monitoring]].

## Placement and grouping

A harness tab is created adjacent to the active tab's group (same group number and bar color), like
an image or page view tab. It participates in tab reordering and grouping as any ordinary tab would.
A harness tab opened by `profile launch` instead joins the profile's own group (see Profiles).

## Persistence

Harness tabs are **live and in-memory** — they are not saved to agent state and are not restored on
`--relaunch`. Each launch starts fresh. A schedule attached to a harness tab (directly, or via a
profile's authored `schedule`/`run` entries — see Profiles) is memory-only for the same reason: it
ends when the harness's PTY exits and its tab closes (see Lifecycle above and Scheduling § Firing).

## Connections panel

While running, the harness PTY appears in the connections panel as `terminal:<name>`.

## Launching with a model and effort level

A harness tab can be opened with a model and/or an effort level selected, either from the
interactive command (`harness <name> --model <name> --effort <level>`) or via `profile launch`
(see Profiles for the harness-entry schema) — both paths behave the same way.

`--model <name>` is passed to the harness binary's `--model` flag verbatim, but is validated first
against that harness's known model catalog; an unknown model is rejected with `Unknown model
"<model>" for harness "<name>" — add it to harness-models.json.` and no tab is opened.

A project can supply its own `.janissary/harness-models.json` (a JSON object mapping harness name to
a list of model ids) to replace the bundled catalog entirely for that project. If the file is
missing, the bundled catalog is used; if it exists but isn't valid JSON, a warning is printed and
the bundled catalog is used.

### What the bundled catalog holds

The bundled catalog names models for the `claude`, `codex`, and `opencode` harnesses. The `opencode`
list spans the three providers that harness reaches — OpenCode Zen, OpenCode Go, and Google AI
directly — with each model carrying its provider prefix, and is the list the conversation tab's model
picker is built from alongside the `claude` list. See [[conversations]].

The catalog is maintained by hand against each provider's own published list, and two rules decide
what goes in it. A model is only removed on evidence that it is gone — a stale entry costs a
launch that fails with the provider's own message, while a missing entry costs a launch janissary
refuses outright for a model that would have worked. And a model is only added if it can hold a
conversation: embedding, speech, transcription, image, and video models are left out even where the
provider offers them through the same key, because every entry in the `claude` and `opencode` lists
is a row in the conversation picker and a row that cannot answer a query is a defect rather than an
option. Where a model has both a dated id and a shorter alias, both are listed — they name the same
model, and dropping either would reject a profile that pins it.

The `opencode` list carries OpenCode Zen's free tier rather than its full catalog. Zen's paid models
are mostly other providers' models re-exposed, and reachable more directly through the entries
already listed.

`--effort <level>` selects an effort level with no validation against any fixed set of levels — the
level is forwarded verbatim, translated to whichever flag the target harness actually understands so
the launch never breaks on a flag the binary would reject:

- **claude** — `--effort <level>`.
- **codex** — the reasoning-effort config override `-c model_reasoning_effort=<level>` (codex has no
  `--effort` flag and would exit on one).
- **opencode** — has no effort flag of its own, so the level is silently dropped rather than passed
  as an argument opencode would reject.

`--model` and `--effort` may be given independently or together, in any order relative to each other
and to `as <label>`, `-w`/`--workspace`, `--offline`, and `-y`/`--yes`.

Whichever of the model and effort were set at launch appear as small chips in the harness tab's
metadata row, positioned between the working directory and the flag icons (so the row reads
working directory, then model, then effort, then flags). Each chip is shown only when its value
was set — a harness launched with neither flag shows no chips and its row is unchanged. The chip
displays the value verbatim; long values are visually truncated, and hovering a chip shows a
tooltip carrying its label and full value (`Model: <value>` or `Effort: <value>`). These chips
appear on harness tabs only — agent and shell tabs' metadata rows are unaffected.
