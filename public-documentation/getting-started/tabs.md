# Tabs

Every tab is an independent workspace: its own transcript, its own command history, its own shell and working directory. Switching tabs never loses anything — a command running in one tab keeps running while you work in another, and each tab's scroll position and history stay where you left them.

A session starts with a single `janus` tab. New tabs are created on demand — agent tabs with the `agent` command (below), and view tabs by opening files, pages, or harnesses (see [Tab Types](/tab-types/opening-files)).

A left and right sidebar flank the tab area, hidden until something is docked into them. Today the [file navigator](/tab-types/file-navigator) is the only tab that can dock — `files left`/`files right` opens (or moves) a tree straight into a sidebar, where it's resizable by dragging its inner edge.

![The tab strip with several agent tabs: each has a colored dot, one dot is blinking to show a busy agent, and an inactive tab carries a sparkle badge for unread output.](/screenshots/tabs-overview.png)

## Creating agent tabs

```
agent           create a tab with a random unused name
agent bilal     create a tab named "bilal"
```

The new tab is focused immediately. Names are always lowercased, and each must be unique — reusing one prints `Agent "<name>" is already active.` and creates nothing. Random names come from a pool of 52 (see [Agents](/getting-started/agents)); if every pool name is taken, bare `agent` prints `All agent names are in use.`

## Reading the tab strip

The strip tells you what every tab is doing without switching to it. Three signals matter:

- **The colored dot.** Every tab gets a dot color picked to stand apart from the colors already on screen, so adjacent tabs are easy to tell apart. The colored band along the top of a tab is its [group](/getting-started/groups).
- **A blinking dot means busy.** While a tab's agent is working — a shell command, an agent turn, anything in flight — its dot blinks on and off. It settles back to a steady fill when the work finishes.
- **A sparkle (✨) means unread output.** When an inactive tab receives new content — a message from another agent, a shell command finishing, agent output — a sparkle badge appears on it. Focusing the tab clears it. The active tab never shows one.

The active tab is also highlighted: full-strength text on the content background, while inactive tabs are muted.

## Switching and reordering

`Shift+←` / `Shift+→` cycle through tabs; the `next` command switches to the next tab. `Ctrl+←` / `Ctrl+→` move the current tab one position left or right — within its own group only (see [Tab groups](/getting-started/groups)).

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

## Agent tool steps fold up

<img class="agent-float" src="/agents/yusuf-south-west.png" alt="" />

When an agent runs a series of tool steps, the transcript collapses each run into a single summary line — `▸ N tool steps  (ctrl+t to expand)` — so the conversation stays readable. Your prompt and the agent's final answer always stay visible. Press `Ctrl+T` to expand or collapse the steps for the current tab.
