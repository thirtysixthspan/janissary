# Starting the app

See [Installing](/user-documentation/getting-started/install) if you haven't installed Janissary yet. 


Run 
```
> janus
```
from the project directory.

<img class="agent-float" src="/agents/ekrem-south.png" alt="" />

`janus` starts the server in the background and hands your shell prompt straight back once it's ready. The terminal you launched from doesn't need to stay open, and closing it — or pressing `Ctrl+C` in it — no longer stops the app. Use [`janus stop`](#stopping-the-app) to shut it down.

Every launch opens the visible zsh [shell tab](/user-documentation/command-bar/shell#open-a-shell-tab) named `janus`, in the project directory. It also starts one hidden `system` shell in the same directory without a workspace. Use `tab focus system` to reveal it; closing it hides it again. Type `shell` in `janus`'s command bar to open another shell tab. Each launch starts fresh, with the previous session's logs, recordings, and workspace clones cleared. Remote sessions you left parked, other than ones holding only an `agent` run, are reattached (see [Starting fresh](#starting-fresh) below).

If the required `janus` shell can't be started, the app doesn't start: the launch fails with `could not open the launch shell` and the reason. If only the hidden `system` shell fails, Janissary continues starting and posts `System shell could not start: <reason>.` in Notifications.

```
> janus ~/dev/my-project
> janus --port=4000 --no-open
> janus --help
```

The first form works against another directory. The second picks the port yourself and skips opening a window. The third prints usage and exits.

## Arguments

| Argument | What it does |
|---|---|
| `<project-dir>` | Target directory to work against (default: current directory). It must already exist. |

Only one directory is accepted. A word that isn't a flag or one of the commands below is read as the directory, so a mistyped command such as `janus stpo` fails with `invalid project directory: stpo is not a directory`. A second directory fails with `unexpected argument: <second one>`. `janus stop` and `janus init` take their own optional directory under the same rules. `janus remote-serve` is the exception, covered under [Commands](#commands).

## Commands

| Command | What it does |
|---|---|
| `janus stop [<project-dir>]` | Stop the running instance for a directory. See [Stopping the app](#stopping-the-app) below. |
| `janus init [<project-dir>]` | Scaffold a new project's `ai/` and `product/` directories. See [Creating a new project](/user-documentation/workflows/creating-a-new-project). |
| `janus remote-serve [<project-dir>]` | Serve this machine to a remote janissary over an ssh session. See [Remote agents](/user-documentation/advanced-agents/remote-agents). |

You never run `remote-serve` yourself. Another Janissary starts it over SSH and talks to it through that session. It runs attached, takes no instance lock, starts no server or window, writes no log, and `janus stop` can't reach it. It ends when the SSH session does. Its directory is a path on the remote machine. If you give one, that exact directory is the root. If you don't, it walks up from the SSH login directory to the first git repository. Either way the root needs an `origin` remote, and a root that doesn't have one is reported back to the Janissary that started it.

## Flags

| Flag | What it does |
|---|---|
| `--port=<n>` | Listen on port `n` (1–65535). `--port <n>` with a space works too. Without it, a free port is picked automatically. |
| `--no-open` | Start the server without opening the app window; prints the server URL to the terminal instead. |
| `--help` | Print usage and exit. |
| `--version` | Print the name and version and exit. |

`--help` and `--version` run attached and print straight to the terminal. They create nothing, start nothing, and open nothing, and both exit with code 0.

```
> janus --version
janissary 0.20.0
```

`--help` prints this:

```
Usage: janus [options] [<project-dir>]
       janus stop [<project-dir>]
       janus init [<project-dir>]
       janus remote-serve [<project-dir>]

A terminal UI shell with built-in commands and shell execution.

Arguments:
  <project-dir>  Target directory (default: current directory)

Commands:
  stop           Stop the running instance for a directory
  init           Scaffold the ai/ and product/ directory tree in a directory
  remote-serve   Serve this machine to a remote janissary over an ssh session

Options:
  --port=<n>     Port to listen on (default: auto)
  --no-open      Start the server without opening the app window
  --help         Show this help
  --version      Show version

Environment:
  JANUS_DEBUG=1  print stack traces on failure
```

Neither flag skips the argument checks. `janus --help --port=abc` and `janus --version nowhere` report the usage error below instead of printing anything.

## Usage errors

A mistyped flag, a bare `--port` with no value, a port that isn't a whole number from 1 to 65535, a second directory, or a `<project-dir>` that doesn't exist or isn't a directory stops the launch before any server starts. The message goes to your terminal, followed by a pointer to `--help`, and the exit code is 2:

```
> janus --port=99999
invalid --port value: 99999
Try 'janus --help' for more information.
```

The other messages you can see:

- `Unknown option '--bogus'. …` for a flag Janissary doesn't have. The rest of that sentence is Node's own advice about arguments that start with a dash.
- `Option '--port <value>' argument missing` for `--port` with nothing after it.
- `Option '--no-open' does not take an argument` for `--no-open=1`. The same goes for `--help` and `--version`.
- `invalid project directory: <dir> is not a directory` for a path that doesn't exist or is a file. `janus` doesn't create it for you.
- `unexpected argument: <dir>` for a second directory.

Usage errors don't carry the `failed to start` banner described under [Troubleshooting](#troubleshooting), because nothing was started. A bad flag in a real directory can still touch that directory's `.janissary/log/server.log`, since the launcher opens the log before it runs the server. A missing or invalid directory can't, so the launcher prints that message directly.

## Where the app opens

By default `janus` opens the app in a frameless Chrome window with no tabs or address bar. It uses the Chrome you have installed, or Chromium, Microsoft Edge, or Brave if Chrome isn't there. The window has its own profile under `.janissary/chrome`, so logins survive between launches.

If none of those browsers is installed, or the window can't be started, Janissary opens the URL in your default browser instead. It works the same way there, except that some sites that refuse to be embedded may not render in [page tabs](/user-documentation/tab-types/web-pages).

`--no-open` opens nothing and prints the server's URL on its own line instead. The same URL is on the `__JANUS_URL__` line of `.janissary/log/server.log`. Open it in any browser, and stop the server with `janus stop`.

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

`janus stop` runs attached and prints straight to the terminal. It signals the running server to shut down gracefully, closing every open browser window before it exits. When it finds an instance it prints nothing. If nothing is running there, it prints `no running janus instance for <dir>` and exits without error. There being nothing to stop isn't a failure.

Three other things shut the server down the same way:

- A `SIGINT` or `SIGTERM` sent to the server process. `janus stop` sends a `SIGTERM`, and the process ID is in `.janissary/lock`. Pressing `Ctrl+C` in the terminal you launched from sends nothing to it, because the server is detached.
- The `quit` command, which asks for confirmation first. See [`quit` and the confirmation dialog](/user-documentation/command-bar/commands#quit-and-the-confirmation-dialog).
- Closing the last app window, covered next.

On the way out the server closes the app window and releases the directory's lock.

When the last window or browser tab showing the app goes away, the server waits one second and then shuts down, the same as `janus stop`. The pause is there so a page reload or a browser back-and-forward can reconnect without losing your session; if a window comes back within that second, the shutdown is cancelled. If you have the app open in two windows, closing one changes nothing.

## Starting fresh

Each launch starts fresh: harness captures, recordings and transcripts, browser logs, Git-failure output, and workspace clones from the previous session are cleared. Local shell and harness tabs, their transcripts and command history, tab-owned scheduled commands, and every other local tab you had open are gone. Project system schedules persist across launches; see [Project system schedules](/user-documentation/automation/scheduling#project-system-schedules). The launch opens the same single `janus` shell tab every launch does.

Detached remote sessions are the exception. Every launch tries each eligible parked remote session independently and opens its tabs as the host answers: surviving remote shell and harness tabs are restored, and remote agent tabs aren't. Remote shells return on their existing PTYs with their last working directories. A host that refuses the attach or has nothing running is marked terminated; a host that can't be reached stays listed as detached in [Sessions](/user-documentation/tab-types/sessions), with the failure on its row and **Attach** available to try again. One unreachable host never holds up the rest. See [Coming back after a restart](/user-documentation/advanced-agents/remote-agents#coming-back-after-a-restart) for the full restore behavior.

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

## Troubleshooting

Since a normal launch doesn't print to the terminal, check `.janissary/log/server.log` for anything the server would otherwise have shown — it's cleared at the start of every launch. A launch that fails outright is the exception: the tail of what that launch wrote to the same log, up to the last couple of hundred lines, is printed to your terminal before `janus` exits with the server's own code, so the reason is usually already on screen and you do not have to go looking for it.

If startup fails, the message opens with the app name and version, as in `janissary 0.20.0 — failed to start: <reason>`, so any report you share says which build it came from. Four failures also say what to do next. Any other failure shows the underlying error's own message after the banner and nothing more. The four you're most likely to see:

- **The port is already in use** — something else is listening on the port you asked for. Pick another with `--port=<n>`, or drop `--port` entirely and let the app choose a free one.
- **Another instance is already running here** — a second `janus` launched against the same directory as a still-running instance is rejected with the live process's ID. Run `janus <dir>` to start a second instance against a different directory. The message also tells you how to clear a lock left behind by an instance that is no longer running: delete `.janissary/lock` in that directory. Check the ID it names first. An instance that was killed hard usually hands its lock to the next launch on its own, so this only comes up when that ID is genuinely alive. A lock that records no usable process ID at all counts as stale too, whether the file is empty, holds `0`, holds a negative number, or holds something that isn't a number: the next launch takes it over instead of refusing, and `janus stop` reports that there is nothing to stop rather than signalling anything. Two launches against one directory at the same moment are settled by taking the lock in a single step, so one of them starts and the other is refused with the process ID of the one that won. The recorded process ID is only refused when the account you are running as can still signal it, so two instances under different accounts sharing one project directory are both admitted, and the two will fight over that directory's saved state.
- **Permission denied binding to the port** — ports below 1024 need elevated privileges. Pick one above 1024 with `--port=<n>`.
- **The web UI bundle is missing** — you're running from a source checkout whose web assets were never built. Run `npm run build:web`, or `npm start`, which builds first.

If the server never reports itself ready within 20 seconds, the launcher stops waiting, kills it, prints `failed to start: timed out waiting for the server`, and exits with code 1.

For a failure you can't place from the message alone, set `JANUS_DEBUG=1` and launch again. The full stack trace is printed after the message, in the terminal and in the log:

```
JANUS_DEBUG=1 janus
```

## Configuration

Settings live in `.janissary/config.json` inside the directory you launch from; Janissary creates a default file on first launch. See [App configuration](/user-documentation/getting-started/configuration) for every setting, its default, and what happens when a value is invalid. You can change `theme` and `syntaxTheme` while the app is running; edit the other settings in the file.
