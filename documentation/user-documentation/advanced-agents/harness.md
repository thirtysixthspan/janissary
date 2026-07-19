# Harness tabs

<img class="agent-float" src="/agents/malik-south.png" alt="" />

`harness <name>` runs an AI coding harness — `claude`, `opencode`, or `codex` — as a full-tab terminal:

```
harness claude
harness opencode as quality        custom tab label
harness claude -w                  in a disposable workspace clone
```

The harness takes over the whole tab: no transcript, no command bar — you're talking straight to the harness's own interface, exactly as you would in a terminal. The binary must be installed and on your `PATH`; if it isn't, the tab closes as soon as it opens (the launch is still recorded in the tab you ran the command from).

![A harness tab: the harness's own terminal interface filling the tab body.](/screenshots/harness-tab.png)

## Typing into a harness

Everything you type goes to the harness — including `Ctrl+C`, `Ctrl+D`, and `Ctrl+R`. Two things are held back for the app: `Shift+←`/`Shift+→` still switch tabs, and clicks on the tab strip still work. Switching to a harness tab focuses its terminal automatically, so you can type immediately. `Shift+Enter` is delivered as a line continuation rather than a submit, which is how you compose multi-line prompts in harnesses like claude.

Tab reordering (`Ctrl+←/→`) isn't available while a harness has focus — switch to another tab first.

## Labels

<img class="agent-float" src="/agents/hakim-south-west.png" alt="" />

The tab is labeled with the harness name by default; a second `harness claude` becomes `claude-2`, and so on. `as <label>` picks your own label instead (collisions get the same `-2` suffix):

```
harness opencode as quality        → tab "quality"
harness opencode as quality        → tab "quality-2"
```

- `harness` with no name opens the **New harness** dialog in the app (see below). Only the classic terminal UI prints `Usage: harness <claude|opencode|codex> [as <label>] [-w].` instead.
- An unknown name: `Unknown harness "foo". Choose from: claude, opencode, codex.`
- `as` with no label: `Usage: harness <claude|opencode|codex> as <label>.`

## New harness dialog

Typing `harness` with no arguments opens a **New harness** dialog instead of erroring: a form with a harness selector, a **Label** field, **Workspace** and **Offline** toggles, an **Auto-approve** toggle, and **Model** and **Effort** dropdowns.

![The New harness dialog, with fields for harness, label, workspace, offline, auto-approve, model, and effort.](/screenshots/harness-launch-dialog.png)

**Auto-approve** stays disabled unless you've picked claude and turned on **Workspace** — the dialog only ever builds a command that's actually valid. **Create** launches the harness right away, the same as typing the equivalent command by hand. **Cancel** or `Escape` closes the dialog with nothing launched. Your choices are remembered for the rest of the session, so reopening the dialog restores your last picks and puts focus on **Create** so Return relaunches immediately.

## Choosing a model and effort level

```
harness <name> [as <label>] [-w] [-y] [--model <name>] [--effort <level>]
```

`--model <name>` picks a model, passed to the harness binary's `--model` flag verbatim. It's checked against that harness's known model catalog first — an unknown model errors with `Unknown model "<model>" for harness "<name>" — add it to harness-models.json.` and no tab opens (today only opencode's and claude's catalogs are populated).

A project can drop its own `.janissary/harness-models.json` (a JSON object mapping harness name to a list of model ids) into its `.janissary/` directory to replace the bundled catalog entirely for that project — useful for pinning a project-specific set of models or covering a harness the bundled catalog doesn't populate. Likewise, a project can drop `.janissary/agent-names.json` (a JSON array of names) to replace the bundled agent name pool. If either file is missing, the bundled default is used; if it exists but isn't valid JSON, a warning is printed and the bundled default is used instead.

`--effort <level>` picks an effort/thinking level, passed to the harness binary's `--effort` flag verbatim — there's no catalog to check it against, so any value you give is forwarded as-is (a harness binary that doesn't understand the flag just ignores it):

```
harness opencode --model opencode-go/glm-5.2 --effort high
harness claude --effort high
```

`--model` and `--effort` can be combined with each other and with `as <label>`, `-w`, and `-y` in any order.

Whichever of `--model` and `--effort` you set show up as small chips in the harness tab's metadata row, next to the working directory — see [the tab metadata row](/user-documentation/getting-started/tabs#the-tab-metadata-row). A launch with neither flag shows no chips.

## Workspaces

`-w` / `--workspace` starts the harness inside a disposable clone of your repository instead of the project itself — the same isolation agents get. See [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent) for how the clone, sandboxing, and GitHub authentication work.

## Auto-approving permission prompts

`-y` / `--yes` lets a claude harness run unattended: when claude raises its own permission prompt, the app answers it automatically instead of waiting for you, and records an `Auto-approved a permission prompt` notification with a link to what was approved. It's claude-only and requires `-w`:

- `harness opencode -y` (or any non-claude harness): `-y/--yes is only supported for the claude harness.`
- `harness claude -y` without `-w`: `-y/--yes requires -w/--workspace: auto-approval is only allowed in a sandboxed workspace.`

A harness launched with `-y` shows the auto-permitting flag icon in its metadata row.

## Starting with a prompt

A trailing `with <prompt>` clause gives the new harness something to do as soon as it's ready, so the launch and its first instruction happen in one command:

```
harness claude with fix the failing tests
```

Everything after the standalone `with` keyword is the prompt, taken verbatim — so words that look like flags or `as` inside it are treated as prompt text, not parsed as options. `with` must come after every other option.

- `harness claude with` (nothing after `with`): `Usage: harness <claude|opencode|codex> [options] with <prompt>.`

Wrapping the whole launch in a [`schedule`](/user-documentation/automation/scheduling) command runs it — fresh harness plus prompt — at a future time: `schedule deploy at 5pm harness claude with fix the failing tests`.

## Lifecycle

The tab lives exactly as long as the harness process. When the harness exits — quitting normally, crashing, or the binary not being found — the tab closes with it, and its on-screen scrollback goes with it. The full session is preserved in a recording file, though (see below). The × button and `close` end it the same way. Harness tabs aren't restored by `janus --relaunch`; each launch starts fresh. If a harness tab is the last tab standing, its exit quits the app.

Other tabs can drive a harness: `send <tab> <text>` types a line into it, and [scheduled commands](/user-documentation/automation/scheduling) targeted at a harness tab are typed into it the same way. A harness launched by a [profile](/user-documentation/automation/profiles) can also be given a model, an effort level, and startup commands, the same as typing the command directly.

## Recordings

Every harness session is recorded automatically — there's no command to start it. The full session, with its timing and colors, is written to a `.cast` file under `.janissary/recordings/` in your project, named `<label>-<timestamp>.cast`. Because the whole stream is saved, you can review a session even after its tab has closed and its scrollback is gone. Only the harness's output is recorded. Nothing you type is ever written to the file.

The file is created only once the harness produces its first output, so a harness that exits immediately (for example, a binary that isn't found) leaves no recording behind.

Replay a recording with [asciinema](https://asciinema.org):

```
asciinema play .janissary/recordings/claude-2026-07-10T18-30-05-123Z.cast
```

The files are standard [asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/), so they also drop into any asciicast web player. Recordings from the current run are cleared the next time you start `janus` normally; a `janus --relaunch` keeps them. SSH sessions are not recorded.

## Capturing a harness's screen

```
harness capture <name>
```

Writes the harness tab labeled `<name>`'s current screen to a file and opens it in an editor tab — a one-off snapshot, unlike the continuous session recording above. `<name>` is the tab's label, not a harness type, matched exactly and case-sensitively.

- `harness capture` with no name: `Usage: harness capture <name>.`
- No tab has that label: `No tab labeled "<name>".`
- The tab isn't a harness tab: `"<name>" is not a harness tab.`
- The tab is a harness tab but nothing has been captured yet: `No capture available for "<name>" yet.`

## Watching a harness with a monitor

You can point a monitor at a harness tab — `monitor <persona> <harness-label>` — to have a persona watch the harness's on-screen output and surface suggestions. The monitor reads the harness's current screen (refreshed as the screen changes), so it reacts to what the harness is actually showing. SSH tabs can be watched the same way. See [Monitoring with personas](/user-documentation/automation/monitoring) for the full picture.

## SSH sessions

<img class="agent-float left" src="/agents/fariz-south-east.png" alt="" />

`ssh <destination>` opens the same kind of full-tab terminal running a real `ssh` session:

```
ssh devbox
ssh -p 2222 admin@host
```

Everything after `ssh` is passed to the real `ssh` binary verbatim — flags, `user@host`, jump hosts, a trailing remote command. The tab is labeled with the bare host name (`admin@10.0.0.5` → `10.0.0.5`), the session appears in the connections panel as `ssh:<destination>`, and [`connection close ssh:<name>`](/user-documentation/command-bar/connections) ends it from any tab. Input, focus, lifecycle, and `send`/schedule delivery all behave exactly as for a harness tab. There's no `as` or `-w` here — anything after the destination belongs to ssh itself.

- `ssh` with no destination: `Usage: ssh <destination> [ssh options].`

Before the tab opens, the `ssh <destination> […]` command itself is recorded in the transcript of the tab you ran it from. That happens first, so the launch stays visible even if the connection fails immediately — an unreachable host or a rejected login closes the new tab right away, and its error output goes with it rather than echoing back to the tab you launched from.

The ssh tab closes as soon as the `ssh` process exits, whether that's a normal logout, a dropped connection, or an immediate failure. Closing the [last remaining tab](/user-documentation/getting-started/tabs#closing-tabs) quits the app, same as any other tab.

Typing `ssh <host>` after `shell` (`shell ssh <host>`) doesn't open a dedicated tab — it opens an inline terminal card in the current tab's transcript instead, the same as any other interactive program run through `shell`. Only a bare `ssh …` command opens its own tab.
