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

- `harness` with no name: `Usage: harness <claude|opencode|codex> [as <label>] [-w].`
- An unknown name: `Unknown harness "foo". Choose from: claude, opencode, codex.`
- `as` with no label: `Usage: harness <claude|opencode|codex> as <label>.`

## Choosing a model and effort level

```
harness <name> [as <label>] [-w] [-y] [--model <name>] [--effort <level>]
```

`--model <name>` picks a model, passed to the harness binary's `--model` flag verbatim. It's checked against that harness's known model catalog first — an unknown model errors with `Unknown model "<model>" for harness "<name>" — add it to harness-models.json.` and no tab opens (today only opencode's and claude's catalogs are populated).

`--effort <level>` picks an effort/thinking level, passed to the harness binary's `--effort` flag verbatim — there's no catalog to check it against, so any value you give is forwarded as-is (a harness binary that doesn't understand the flag just ignores it):

```
harness opencode --model opencode-go/glm-5.2 --effort high
harness claude --effort high
```

`--model` and `--effort` can be combined with each other and with `as <label>`, `-w`, and `-y` in any order.

## Workspaces

`-w` / `--workspace` starts the harness inside a disposable clone of your repository instead of the project itself — the same isolation agents get. See [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent) for how the clone, sandboxing, and GitHub authentication work.

## Lifecycle

The tab lives exactly as long as the harness process. When the harness exits — quitting normally, crashing, or the binary not being found — the tab closes with it, and its on-screen scrollback goes with it. The full session is preserved in a recording file, though (see below). The × button and `close` end it the same way. Harness tabs aren't restored by `janus --relaunch`; each launch starts fresh. If a harness tab is the last tab standing, its exit quits the app.

Other tabs can drive a harness: `send <tab> <text>` types a line into it, and [scheduled commands](/user-documentation/automation/scheduling) targeted at a harness tab are typed into it the same way. A harness launched by a [profile](/user-documentation/automation/profiles) can also be given a model, an effort level, and startup commands, the same as typing the command directly.

## Recordings

Every harness session is recorded automatically — there's no command to start it. The full session, with its timing and colors, is written to a `.cast` file under `.janissary/recordings/` in your project, named `<label>-<timestamp>.cast`. Because the whole stream is saved, you can review a session even after its tab has closed and its scrollback is gone.

Replay a recording with [asciinema](https://asciinema.org):

```
asciinema play .janissary/recordings/claude-2026-07-10T18-30-05-123Z.cast
```

The files are standard [asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/), so they also drop into any asciicast web player. Recordings from the current run are cleared the next time you start `janus` normally; a `janus --relaunch` keeps them. SSH sessions are not recorded.

## Watching a harness with a monitor

You can point a monitor at a harness tab — `monitor <persona> <harness-label>` — to have a persona watch the harness's on-screen output and surface suggestions. The monitor reads the harness's current screen (refreshed as the screen changes), so it reacts to what the harness is actually showing. SSH tabs can't be watched this way.

## SSH sessions

<img class="agent-float left" src="/agents/fariz-south-east.png" alt="" />

`ssh <destination>` opens the same kind of full-tab terminal running a real `ssh` session:

```
ssh devbox
ssh -p 2222 admin@host
```

Everything after `ssh` is passed to the real `ssh` binary verbatim — flags, `user@host`, jump hosts, a trailing remote command. The tab is labeled with the bare host name (`admin@10.0.0.5` → `10.0.0.5`), the session appears in the connections panel as `ssh:<destination>`, and `connection close ssh:<name>` ends it from any tab. Input, focus, lifecycle, and `send`/schedule delivery all behave exactly as for a harness tab. There's no `as` or `-w` here — anything after the destination belongs to ssh itself.
