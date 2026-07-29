# Tabs

Every tab is an independent workspace: its own transcript, its own command history, its own shell and working directory. Switching tabs never loses anything — a command running in one tab keeps running while you work in another, and each tab's scroll position and history stay where you left them.

A session starts with a single `janus` tab. New tabs are created on demand — agent tabs with the `agent` command (below), and view tabs by opening files, pages, or harnesses (see [Tab Types](/user-documentation/tab-types/opening-files)).

A left and right sidebar flank the tab area, hidden until something is docked into them. Three kinds of tab can dock — the [file navigator](/user-documentation/tab-types/file-navigator), the [notifications](/user-documentation/tab-types/notifications) feed, and the [schedules](/user-documentation/automation/scheduling) tab — each with its own `left`/`right` form (`files left`, `notifications right`, `schedules left`) that opens or moves it straight into a sidebar. Drag the up/down-arrow button at the right of a sidebar's tab gutter to resize it. A sidebar holds at most one docked tab of each kind; docking a second tab of the *same* kind into an occupied side sends the first back to the center strip, but different kinds share the sidebar side by side.

When a sidebar holds more than one docked tab, it shows its own small tab strip above the visible one — one entry per docked tab, each with its own **×** close button. Clicking an entry switches which docked tab is visible; double-clicking its label opens the same inline rename control as any tab in the center strip. Which entry is visible is only ever remembered on your screen — it resets the next time you launch or relaunch the app.

A docked tab is never the active tab. Docking the active tab moves focus to the nearest central tab,
and undocking it makes it active again. Tab-cycling commands skip docked tabs. A docked tab leaves
the central strip completely and returns to its reordered position in its group when you undock it.
Dragging a sidebar tab label reorders docked tabs within that sidebar without docking, undocking,
or moving the tab to another strip.
The sidebar entry's **×** is its only direct close button. Typing `close` cannot target a docked tab,
but `close <label>` still works.

Sidebar visibility is derived from its contents. An empty sidebar cannot be shown, and a docked tab
does not keep the app alive: closing the last non-docked tab still quits. Dragging a sidebar's
resize control changes its width within a minimum and roughly half the viewport. Sidebar width and
dock placement reset on relaunch and are never persisted.

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
- **A flag icon means unread output.** When a tab that is not visible in either pane receives new content — a message from another agent, a shell command finishing, agent output — a flag badge appears on it. Selecting it clears the flag.

The active tab is also highlighted: full-strength text on the content background, while inactive tabs are muted.

## Working in two panes

Action tabs have a **Split** button at the right edge of their metadata header. Click it to move that tab into a second pane
beside the first one. Each pane gets its own tab strip and keeps one tab visible; click anywhere in
a pane to make it the focused one. The focused pane keeps its tab-colored left border; the other pane's border turns muted gray. New tabs opened from an action tab join that tab's pane.

When both panes show agent tabs, both keep their command lines and the same metadata buttons. The command line in the unfocused pane stays visible without stealing keyboard focus. Click it to focus that pane, then type normally. Pickers, transcript search, and dialogs stay with the focused pane.

Drag the divider between the panes to resize them. The divider starts in the middle and stops at
15% or 85% of the center area, so neither pane can disappear accidentally. Moving, closing, or
docking the last tab from one side collapses the split back to a single strip.

Tab-strip dragging and `Ctrl+←` / `Ctrl+→` reorder tabs only inside the focused pane. Global
navigation still crosses both panes: `Shift+←` / `Shift+→`, `next`, and `Ctrl+G` move through every
central action tab. Sidebars remain outside the split, and the lower reporting area stays full
width.

## The tab metadata row

Agent and harness tabs show a small metadata row above their body: the tab's working directory, followed by an emoji for each active flag (📦 workspaced, ⚡ auto-permitting). Every action button stays grouped at the right edge of that row. Agent and harness tabs carry a 📁 file-navigator button there (tooltip "Open file navigator here"). Clicking it opens a [file navigator](/user-documentation/tab-types/file-navigator) rooted at that tab's working directory, docked in the left sidebar by default, or retargets an already-open navigator to that directory. Shell tabs don't show the 📁 button.

Next to it, agent and harness tabs also carry a ➕ button (tooltip "New agent here"). Clicking it creates a new, auto-named agent tab rooted at the same working directory, joins it to the same group, and focuses it right away: the one-click version of typing `agent`, except the new tab starts where you clicked instead of the server's own directory. Nothing happens if there's no known working directory to start from, and shell tabs don't show this button either. If every agent name is already taken, you get `All agent names are in use.` in the [notifications](/user-documentation/tab-types/notifications) feed instead of the source tab, since a harness tab has no transcript of its own to report into.

Agent tabs also carry a 📋 button (tooltip "Open transcript"). Clicking it writes the tab's full transcript, every command and its output, to a plain-text file and opens that file in an [editor](/user-documentation/tab-types/editor) tab, the same way a screen capture or a monitor snapshot does elsewhere in the app. It's a no-op on a tab with nothing in its transcript yet.

Harness tabs carry the same 📋 button, but clicking it opens the harness's session transcript instead — the same file `harness transcript` opens (see [Harness](/user-documentation/advanced-agents/harness)) — since a harness tab has no command transcript of its own. It's a no-op when the harness has no session transcript available yet.

Text in metadata rows and headers can be selected with the mouse and copied, including paths and other details shown by agent, file, editor, image, Markdown, page, and monitor tabs.

<img class="agent-float" src="/agents/ahmed-south-west.png" alt="" />

## Switching and reordering

`Shift+←` / `Shift+→` cycle through tabs; the `next` command switches to the next tab. `Ctrl+←` / `Ctrl+→` move the current tab one position left or right — within its own group only (see [Tab groups](/user-documentation/getting-started/groups)). With several tabs open, the [tab navigator](/user-documentation/command-bar/tab-navigator) (`Ctrl+G`) jumps straight to any of them by typing part of its label or number.

## Renaming a tab

<img class="agent-float" src="/agents/orhan-south.png" alt="" />

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

The app shortens project paths to `$root` in its prompts, panels, headers, and status messages:

```
$root/                  = /Users/name/dev/project
$root/src/cli.ts        = /Users/name/dev/project/src/cli.ts
$root/workspace/emrah   = a workspaced agent's clone, inside the project
```

The hidden `.janissary` state directory folds into the root, so a workspaced clone appears as
`$root/workspace/emrah` even though its full path includes `.janissary`. The most specific matching
prefix wins. The root directory itself appears as `$root/`. Paths elsewhere under your home
directory shorten to `~`.

The shortcut appears in the working directory beside a command prompt, the connections panel, an
editor tab's metadata header, and app status messages that name a path. It is display-only. The
underlying absolute paths do not change, and the raw output of your shell commands is never rewritten.

You can also type `$root` or `~` at the start of a path passed to `open`, `edit`, or `files`:

```
open $root/src/cli.ts
edit ~/notes.txt
files $root
```

Only a path prefix is expanded. A `$root` or `~` in the middle of a path stays literal. The window
titlebar is the one exception to display shortening. It reads `Janissary (<version>): <full absolute path>`.

## Reading the transcript

<img class="agent-float left" src="/agents/selim-south-east.png" alt="" />

A path and line number in output, like `src/foo.ts:42`, is a clickable link. Click it to open that file in an editor tab with the cursor on that line. This works in your own shell output and in an agent's output alike.

Double-click a previous command's prompt line — the chevron and the command text — to run it again. Clicking the leading working-directory text on that line does nothing; only the command text after it re-runs. A single click does nothing either, so click-and-drag text selection still works. If the double-click lands on text that is still selected from an earlier selection, it is suppressed and does not run the command.

When an interactive program such as `vim` or `less` takes over the tab, the transcript and command
bar disappear while the full-tab terminal is active. They return exactly as they were when the
program exits, with no new transcript entries. New output normally returns the transcript to the
bottom automatically.

Shell output keeps its color, whether you ran the command yourself or an agent did: a test suite's colored pass/fail summary, for example, renders with the same colors it would in a real terminal.

![Shell output in the transcript: a grep match highlighted in the shell's color, with the file path and line number rendered as an underlined, clickable link.](/screenshots/transcript-file-link.png)

Besides the keys in [Keyboard shortcuts](/user-documentation/getting-started/keyboard), the mouse wheel scrolls the transcript one line per tick. Once you've scrolled up from the bottom, a scrollbar with a percentage appears in the command bar, showing how far back you are.

## Agent tool steps fold up


When an agent runs a series of tool steps, the transcript collapses each run into a single summary line — `▸ N tool steps  (ctrl+t to expand)` — so the conversation stays readable. Your prompt and the agent's final answer always stay visible. Click the summary line, or press `Ctrl+T`, to expand or collapse the steps for the current tab.
