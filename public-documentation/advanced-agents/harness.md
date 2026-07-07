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

## Workspaces

`-w` / `--workspace` starts the harness inside a disposable clone of your repository instead of the project itself — the same isolation agents get. See [Workspaced agents](/advanced-agents/workspaced-agent) for how the clone, sandboxing, and GitHub authentication work.

## Lifecycle

The tab lives exactly as long as the harness process. When the harness exits — quitting normally, crashing, or the binary not being found — the tab closes with it, scrollback included. The × button and `close` end it the same way. Harness tabs aren't restored by `janus --relaunch`; each launch starts fresh. If a harness tab is the last tab standing, its exit quits the app.

Other tabs can drive a harness: `send <tab> <text>` types a line into it, and [scheduled commands](/automation/scheduling) targeted at a harness tab are typed into it the same way. A harness launched by a [profile](/automation/profiles) can also be given a model and startup commands.

## SSH sessions

<img class="agent-float left" src="/agents/fariz-south-east.png" alt="" />

`ssh <destination>` opens the same kind of full-tab terminal running a real `ssh` session:

```
ssh devbox
ssh -p 2222 admin@host
```

Everything after `ssh` is passed to the real `ssh` binary verbatim — flags, `user@host`, jump hosts, a trailing remote command. The tab is labeled with the bare host name (`admin@10.0.0.5` → `10.0.0.5`), the session appears in the connections panel as `ssh:<destination>`, and `connection close ssh:<name>` ends it from any tab. Input, focus, lifecycle, and `send`/schedule delivery all behave exactly as for a harness tab. There's no `as` or `-w` here — anything after the destination belongs to ssh itself.
