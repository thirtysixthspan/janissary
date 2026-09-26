# Browser automation

<img class="agent-float" src="/agents/cavus-south-west.png" alt="" />

The `browser` command drives a real Chromium browser from a tab, so you (or that tab's agent) can open a page, read its rendered text, run JavaScript against it, and capture a screenshot:

```
browser goto https://example.com
browser content
```

`goto`, `content`, `eval`, and `shot` all auto-launch the tab's browser and open a window if none exists yet, so you rarely need to call `open` yourself.

| Subcommand | What it does |
|---|---|
| `browser open [name] [--headed\|-H]` | Launch this tab's browser if it isn't running, and open a new window |
| `browser list` | List this tab's windows, marking the current one |
| `browser use <id>` | Make a window current |
| `browser goto <url>` | Navigate the current window |
| `browser content` | Print the current page's rendered text |
| `browser eval <js>` | Run JavaScript in the page and print the result |
| `browser shot` | Screenshot the viewport to a PNG |
| `browser close [id]` / `browser window close <id>` | Close the current window, or a specific one by id |

A bare `browser` prints a `Usage:` line listing every subcommand. Every `browser` command shows a `Running…` line in the transcript while it works, then fills that same line in with the result. See [Tab completion](/user-documentation/command-bar/tab-completion) for completing subcommands and window ids with `Tab`.

## One browser per tab, with its own windows

<img class="agent-float" src="/agents/dogan-south.png" alt="" />

Each tab that uses `browser` gets its own Chromium process, separate from every other tab. Inside that process, a *window* is an isolated browsing context (its own cookies and storage), addressed by an id like `w1`, `w2`, and so on, counting up as you open more. `browser open` opens a new window and makes it current; `browser use w2` switches; `browser list` shows every open window with `*` marking the current one:

```
> browser list
* browser:w1
  browser:w2
```

`browser open` confirms the window it made, naming the mode it launched in:

```
> browser open
Opened browser window w1 (headless).
```

A tab never starts a second browser. Commands that arrive while the first launch is still finishing wait for that one launch and share it, so a tab that has three things to look at ends up with a single Chromium. Closing the tab mid-launch closes the browser as soon as it is up, and the commands still waiting on it report `Browser error: the tab closed while its browser was launching` instead of running.

## Headless by default, headed on request

<img class="agent-float left" src="/agents/demir-south-east.png" alt="" />

A tab's browser runs headless (no visible window) unless you launch it with `browser open --headed` (or `-H`). The mode is set once, when the browser first launches for that tab, and stays fixed for as long as that browser process runs. Each tab picks its own mode, so one tab can run headless while another runs headed at the same time. Asking for `--headed` against a browser that's already running headless does nothing but note that it's already headless. To switch modes, close every window in that tab (`browser close` for each, or `browser window close <id>`), which ends the process, then `browser open --headed` again.

Headed mode needs a display. On a machine without one, such as a remote server or a container, the launch fails and you get a `Browser error: …` line in the transcript rather than a crash.

## Why a site doesn't see a bot

Some sites look for automated browsers and refuse to serve them a page. This browser is built so they have a hard time telling:

- It runs Chromium's current headless mode, which is a real browser with nothing drawn on screen, rather than the older headless shell that sites recognize easily.
- The switch that makes a browser announce itself as automated is turned off, and every page in every window is told `navigator.webdriver` is `false`, so a site that checks that property finds nothing to report.
- Each window gets its own random desktop identity: a browser version matching the engine actually running, with a platform, language, time zone, and window size that agree with it. Two windows never look alike, and no part of the identity contradicts another.

None of this is a guarantee. A site that blocks automated traffic outright can still refuse to serve a page.

## Reading a page

`browser goto <url>` waits for the page to load, then answers with its title and address, so you can see where you landed. `browser content` returns the page's rendered text (what a reader would see, not the raw HTML), cut off at roughly 10,000 characters with a note that it was truncated. That keeps a long page from overflowing the transcript. `browser eval <js>` runs JavaScript in the page and prints the result as JSON.

## Screenshots

`browser shot` captures the current window's viewport to a PNG in a temporary directory and prints the path. On macOS it also opens the image in Preview; on other platforms only the path is printed.

## Closing windows and browsers

`browser close` closes the current window; `browser close <id>` and `browser window close <id>` close a specific one (the two forms are equivalent). Closing a tab's last window ends that tab's browser process. Closing the tab, or quitting the app, closes every window it had open.

Browser windows are live, per-tab state: unlike a SQLite connection, they are **not** restored by `janus --relaunch`. Start with `browser open` again after a relaunch if you need one.
