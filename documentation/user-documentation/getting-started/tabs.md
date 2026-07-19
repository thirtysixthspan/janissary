# Tabs

Every tab is an independent workspace: its own transcript, its own command history, its own shell and working directory. Switching tabs never loses anything — a command running in one tab keeps running while you work in another, and each tab's scroll position and history stay where you left them.

A session starts with a single `janus` tab. New tabs are created on demand — agent tabs with the `agent` command (below), and view tabs by opening files, pages, or harnesses (see [Tab Types](/user-documentation/tab-types/opening-files)).

A left and right sidebar flank the tab area, hidden until something is docked into them. Three kinds of tab can dock — the [file navigator](/user-documentation/tab-types/file-navigator), the [notifications](/user-documentation/tab-types/notifications) feed, and the [schedules](/user-documentation/automation/scheduling) tab — each with its own `left`/`right` form (`files left`, `notifications right`, `schedules left`) that opens or moves it straight into a sidebar, where it's resizable by dragging its inner edge. A sidebar holds at most one docked tab of each kind; docking a second tab of the *same* kind into an occupied side sends the first back to the center strip, but different kinds share the sidebar side by side.

When a sidebar holds more than one docked tab, it shows its own small tab strip above the visible one — one entry per docked tab, each with its own **×** close button. Clicking an entry switches which docked tab is visible; double-clicking its label opens the same inline rename control as any tab in the center strip. Which entry is visible is only ever remembered on your screen — it resets the next time you launch or relaunch the app.

![A sidebar holding a file navigator and the notifications feed together, with its own small tab strip above the visible one.](/screenshots/sidebar-shared.png)

![The tab strip with several agent tabs: each has a colored dot, one dot is blinking to show a busy agent, and an inactive tab carries a flag badge for unread output.](/screenshots/tabs-overview.png)

## Creating agent tabs

```
agent           create a tab with a random unused name
agent bilal     create a tab named "bilal"
```

The new tab is focused immediately. Names are always lowercased, and each must be unique — reusing one prints `Agent "<name>" is already active.` and creates nothing. Random names come from a pool of 52 (see [Agents](/user-documentation/getting-started/agents)); if every pool name is taken, bare `agent` prints `All agent names are in use.`

## Reading the tab strip

The strip tells you what every tab is doing without switching to it. Three signals matter:

- **The colored dot.** Every tab gets a dot color picked to stand apart from the colors already on screen, so adjacent tabs are easy to tell apart. The colored band along the top of a tab is its [group](/user-documentation/getting-started/groups).
- **A blinking dot means busy.** While a tab's agent is working — a shell command, an agent turn, anything in flight — its dot blinks on and off. It settles back to a steady fill when the work finishes.
- **A flag icon means unread output.** When an inactive tab receives new content — a message from another agent, a shell command finishing, agent output — a flag badge appears on it. Focusing the tab clears it. The active tab never shows one.

The active tab is also highlighted: full-strength text on the content background, while inactive tabs are muted.

## The tab metadata row

Agent and harness tabs show a small metadata row above their body: the tab's working directory, followed by an emoji for each active flag (📦 workspaced, ⚡ auto-permitting). At the right of that row, agent and harness tabs also carry a 📁 file-navigator button (tooltip "Open file navigator here") — clicking it opens a [file navigator](/user-documentation/tab-types/file-navigator) rooted at that tab's working directory, docked in the left sidebar by default, or retargets an already-open navigator to that directory. Shell tabs don't show the 📁 button.

## Switching and reordering

`Shift+←` / `Shift+→` cycle through tabs; the `next` command switches to the next tab. `Ctrl+←` / `Ctrl+→` move the current tab one position left or right — within its own group only (see [Tab groups](/user-documentation/getting-started/groups)). With several tabs open, the [tab navigator](/user-documentation/command-bar/tab-navigator) (`Ctrl+G`) jumps straight to any of them by typing part of its label or number.

## Renaming a tab

<img class="agent-float left" src="/agents/fariz-south-east.png" alt="" />

`rename <newname>` gives the current tab a display alias — a name shown in the strip in place of its real label. Bare `rename` clears the alias. You can also double-click the label of the active tab and type a new name in place; Enter commits, Escape cancels.

The alias is display-only. Messaging, scheduling, and every other feature that targets a tab by name keeps using the original label, and the confirmation message reminds you of that. Aliases survive `--relaunch`.

## Closing tabs

```
close             close the current tab
close bilal       close the tab named "bilal" (case-insensitive)
close page 2      close the embedded web page numbered 2
```

`exit` is an alias of `close`. Closing a tab tears down everything it owns — its shell, agent session, scheduled commands, and workspace clone if it has one — and focus moves to an adjacent tab.

Closing the **last** remaining tab quits the app. If you type `close` (or `exit`) on the last tab, the quit confirmation dialog appears first, exactly as if you'd typed `quit`; closing it via the tab strip's × button quits directly. If no tab matches the name you gave, an error is reported.

## How paths are shown: `$root`

Wherever the app prints a filesystem path in a transcript, paths inside the directory you launched from are shortened to `$root`:

```
$root/src/cli.ts        = /Users/name/dev/project/src/cli.ts
$root/workspace/emrah   = a workspaced agent's clone, inside the project
```

Paths outside the project but under your home directory shorten to `~`. This is display-only — the real absolute paths are what actually get used, and the raw output of your own shell commands is never rewritten.

## Reading the transcript

<img class="agent-float" src="/agents/tahir-south-east.png" alt="" />

A path and line number in output, like `src/foo.ts:42`, is a clickable link. Click it to open that file in an editor tab with the cursor on that line. This works in your own shell output and in an agent's output alike.

Double-click a previous command's prompt line — the chevron and the command text — to run it again. Clicking the leading working-directory text on that line does nothing; only the command text after it re-runs. A single click does nothing either, so click-and-drag text selection still works.

Shell output keeps its color, whether you ran the command yourself or an agent did: a test suite's colored pass/fail summary, for example, renders with the same colors it would in a real terminal.

![Shell output in the transcript: a grep match highlighted in the shell's color, with the file path and line number rendered as an underlined, clickable link.](/screenshots/transcript-file-link.png)

Besides the keys in [Keyboard shortcuts](/user-documentation/getting-started/keyboard), the mouse wheel scrolls the transcript one line per tick. Once you've scrolled up from the bottom, a scrollbar with a percentage appears in the command bar, showing how far back you are.

## Agent tool steps fold up

<img class="agent-float left" src="/agents/yusuf-south-west.png" alt="" />

When an agent runs a series of tool steps, the transcript collapses each run into a single summary line — `▸ N tool steps  (ctrl+t to expand)` — so the conversation stays readable. Your prompt and the agent's final answer always stay visible. Click the summary line, or press `Ctrl+T`, to expand or collapse the steps for the current tab.
