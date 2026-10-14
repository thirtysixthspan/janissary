# Starting the app

See [Installing](/user-documentation/getting-started/install) if you haven't installed Janissary yet. 


Run 
```
> janus
```
from the project directory.

<img class="agent-float" src="/agents/ekrem-south.png" alt="" />

`janus` starts the server in the background and hands your shell prompt straight back once it's ready. The terminal you launched from doesn't need to stay open, and closing it — or pressing `Ctrl+C` in it — no longer stops the app. Use [`janus stop`](#stopping-the-app) to shut it down.

Every launch opens a single zsh [shell tab](/user-documentation/command-bar/shell#open-a-shell-tab) named `janus`, in the project directory. Type `shell` in its command bar to open a shell tab. By default each launch also starts fresh, with the previous session's logs, recordings, and workspace clones cleared; `--relaunch` (below) keeps them.

If the shell can't be started, the app doesn't start either: the launch fails with `could not open the launch shell` and the reason.

## Arguments

| Argument | What it does |
|---|---|
| `<project-dir>` | Target directory to work against (default: current directory). |

## Commands

| Command | What it does |
|---|---|
| `janus stop [<project-dir>]` | Stop the running instance for a directory. See [Stopping the app](#stopping-the-app) below. |
| `janus init [<project-dir>]` | Scaffold a new project's `ai/` and `product/` directories. See [Creating a new project](/user-documentation/workflows/creating-a-new-project). |
| `janus remote-serve [<project-dir>]` | Serve this machine to a remote janissary over an ssh session. See [Remote agents](/user-documentation/advanced-agents/remote-agents). |

## Flags

| Flag | What it does |
|---|---|
| `--port=<n>` | Listen on port `n` (1–65535). Without it, a free port is picked automatically. |
| `--no-open` | Start the server without opening the app window; prints the server URL to the terminal instead. |
| `--relaunch` | Keep the previous session's logs, recordings, and workspace clones instead of clearing them, and reattach parked remote sessions. |
| `--help` | Print usage and exit. |
| `--version` | Print the name and version and exit. |

A mistyped flag, a bare `--port` with no value, a port outside 1–65535, more than one positional argument, or a `<project-dir>` that doesn't exist or isn't a directory stops the launch with an error and a pointer to `--help` — nothing is started and no state is touched. These usage errors exit with code 2.

## Stopping the app

<img class="agent-float left" src="/agents/hamza-south-east.png" alt="" />

Since a normal launch detaches into the background, closing the terminal doesn't stop it. Run this from the project directory instead:

```
> janus stop
```

It shuts down the instance running against the current directory. Pass a directory to stop an instance running elsewhere:

```
> janus stop <project-dir>
```

`janus stop` runs attached and prints straight to the terminal. It signals the running server to shut down gracefully, closing every open browser window before it exits. If nothing is running there, it prints `no running janus instance for <dir>` and exits without error — there being nothing to stop isn't a failure.

Closing the app window stops it too. When the last window or browser tab showing the app goes away, the server waits one second and then shuts down, the same as `janus stop`. The pause is there so a page reload or a browser back-and-forward can reconnect without losing your session; if a window comes back within that second, the shutdown is cancelled. If you have the app open in two windows, closing one changes nothing.

## Keeping state with `--relaunch`

```
janus --relaunch
```


`--relaunch` keeps what the previous session left on disk instead of clearing it: harness recordings and transcripts, browser logs, and workspace clones are all still there. It doesn't bring local tabs back. A relaunch opens the same single `janus` shell tab every launch does, and local shell and harness tabs, their transcripts and command history, scheduled commands, and every other local tab you had open are gone. Detached remote sessions are the exception: surviving remote shell and harness tabs are restored.

`--relaunch` tries each eligible parked remote session independently and opens its tabs as the host answers. Remote agent tabs aren't restored. Remote shells return on their existing PTYs with their last working directories. A host that refuses the attach or has nothing running is marked terminated; a host that can't be reached stays listed as detached in [Sessions](/user-documentation/tab-types/sessions), with the failure on its row and **Attach** available to try again. One unreachable host never holds up the rest. See [Coming back after a restart](/user-documentation/advanced-agents/remote-agents#coming-back-after-a-restart) for the full restore behavior.

Without `--relaunch`, parked sessions stay detached in Sessions and wait for you to press **Attach**.

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

## Troubleshooting

Since a normal launch doesn't print to the terminal, check `.janissary/log/server.log` for anything the server would otherwise have shown — it's cleared at the start of each normal launch and kept (with new output appended) across `--relaunch`. A launch that fails outright is the exception: the tail of what that launch wrote to the same log, up to the last couple of hundred lines, is printed to your terminal before `janus` exits with the server's own code, so the reason is usually already on screen and you do not have to go looking for it. Under `--relaunch` that is only the new launch's output, never an earlier run's.

If startup fails, the error names the app and version, says what went wrong, and suggests what to do next. The ones you're most likely to see:

- **The port is already in use** — something else is listening on the port you asked for. Pick another with `--port=<n>`, or drop `--port` entirely and let the app choose a free one.
- **Another instance is already running here** — a second `janus` launched against the same directory as a still-running instance is rejected with the live process's ID. Run `janus <dir>` to start a second instance against a different directory. The message also tells you how to clear a lock left behind by an instance that is no longer running: delete `.janissary/lock` in that directory. Check the ID it names first. An instance that was killed hard usually hands its lock to the next launch on its own, so this only comes up when that ID is genuinely alive. A lock that records no usable process ID at all counts as stale too, whether the file is empty, holds `0`, holds a negative number, or holds something that isn't a number: the next launch takes it over instead of refusing, and `janus stop` reports that there is nothing to stop rather than signalling anything. Two launches against one directory at the same moment are settled by taking the lock in a single step, so one of them starts and the other is refused with the process ID of the one that won. The recorded process ID is only refused when the account you are running as can still signal it, so two instances under different accounts sharing one project directory are both admitted, and the two will fight over that directory's saved state.
- **Permission denied binding to the port** — ports below 1024 need elevated privileges. Pick one above 1024 with `--port=<n>`.
- **The web UI bundle is missing** — you're running from a source checkout whose web assets were never built. Run `npm run build:web`, or `npm start`, which builds first.

If the server never reports itself ready within 20 seconds, the launcher stops waiting, kills it, and tells you it timed out.

For a failure you can't place from the message alone, set `JANUS_DEBUG=1` and launch again. The full stack trace is printed after the message, in the terminal and in the log:

```
JANUS_DEBUG=1 janus
```

## Configuration

Settings live in `.janissary/config.json` inside the directory you launch from; Janissary creates a default file on first launch. See [App configuration](/user-documentation/getting-started/configuration) for every setting, its default, and what happens when a value is invalid. You can change `theme` and `syntaxTheme` while the app is running; edit the other settings in the file.
