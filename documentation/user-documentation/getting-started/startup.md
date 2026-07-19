# Starting the app

See [Installing](/user-documentation/getting-started/install) if you haven't installed Janissary yet. 


Run 
```
> janus
```
from the project directory.

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

`janus` starts the server in the background and hands your shell prompt straight back once it's ready. The terminal you launched from doesn't need to stay open, and closing it — or pressing `Ctrl+C` in it — no longer stops the app. Use [`janus stop`](#stopping-the-app) to shut it down.

By default each launch starts fresh: a single `janus` tab, with any state from the previous session cleared. To pick up where you left off instead, use `--relaunch` (below).

## Arguments

| Argument | What it does |
|---|---|
| `<project-dir>` | Target directory to work against (default: current directory). |

## Flags

| Flag | What it does |
|---|---|
| `--port=<n>` | Listen on port `n` (1–65535). Without it, a free port is picked automatically. |
| `--no-open` | Start the server without opening the app window; prints the server URL to the terminal instead. |
| `--relaunch` | Restore the previous session instead of starting fresh. |
| `--help` | Print usage and exit. |
| `--version` | Print the name and version and exit. |

A mistyped flag, a bare `--port` with no value, or a port outside 1–65535 stops the launch with an error and a pointer to `--help` — nothing is started and no state is touched.

## Stopping the app

<img class="agent-float left" src="/agents/malik-south.png" alt="" />

Since a normal launch detaches into the background, closing the terminal doesn't stop it. Run this from the project directory instead:

```
> janus stop
```

It shuts down the instance running against the current directory. Pass a directory to stop an instance running elsewhere:

```
> janus stop <project-dir>
```

`janus stop` runs attached and prints straight to the terminal. It signals the running server to shut down gracefully, closing every open browser window before it exits. If nothing is running there, it prints `no running janus instance for <dir>` and exits without error — there being nothing to stop isn't a failure.

## Resuming a session with `--relaunch`

```
janus --relaunch
```

<img class="agent-float" src="/agents/hakim-south-east.png" alt="" />

`--relaunch` rebuilds your tabs as you left them: every agent tab comes back in its saved order with its dot color, group, transcript, command history, and working directory. Tab aliases and scheduled commands are restored too. What doesn't come back: view tabs (images, Markdown, editors, web pages), harness tabs, and workspace clones — those are live views and processes, not saved state.

## Troubleshooting

Since a normal launch doesn't print to the terminal, check `.janissary/log/server.log` for anything the server would otherwise have shown — it's cleared at the start of each normal launch and kept (with new output appended) across `--relaunch`.

If startup fails, the error names the app and version, says what went wrong, and suggests what to do next. The two you're most likely to see:

- **The port is already in use** — something else is listening on the port you asked for. Pick another with `--port=<n>`, or drop `--port` entirely and let the app choose a free one.
- **Another instance is already running here** — a second `janus` launched against the same directory as a still-running instance is rejected with the live process's ID. Run `janus <dir>` to start a second instance against a different directory.

## Configuration

Settings live in `.janissary/config.json` inside the directory you launch from; a default file is created on first launch. Every setting is editable in the file:

| Setting | Default | What it does |
|---|---|---|
| `transcriptMaxLines` | `25000` | How many transcript entries each tab keeps. Past the cap, the oldest entries are dropped. |
| `tabNameMaxLength` | `16` | The longest tab name shown in the strip when a tab is created; the strip truncates to fit. Renaming via `rename` or double-click accepts up to 50 characters regardless of this setting. |
| `theme` | `"dark"` | The application color theme. Change it at runtime with [`theme <name>`](/user-documentation/command-bar/commands#theme). |
| `syntaxTheme` | `"github-dark"` | The syntax-highlighting theme for [editor tabs](/user-documentation/tab-types/editor). Change it at runtime with `syntax theme <name>`. |
| `sandboxWorkspaces` | `true` | Whether workspaced tabs are confined to their workspace clone by the macOS sandbox. See [Workspacing](/user-documentation/advanced-agents/workspacing). |
| `notifications` | all events off | Which background events feed the [notifications](/user-documentation/tab-types/notifications) tab. There's no runtime command for this; edit the file directly. |

Changing `theme` or `syntaxTheme` at runtime rewrites this file, preserving every other key, and warns if the write fails. If the file isn't valid JSON, the app warns on startup and falls back to defaults for that session — your file is left untouched so you can fix it.
