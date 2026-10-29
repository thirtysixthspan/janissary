# Launcher

<img class="agent-float" src="/agents/idris-south-east.png" alt="" />

Open the launcher to run common commands and jump to a tab from a sidebar.

```
launcher
```

`launcher` opens or focuses the launcher in the left sidebar. Use `launcher left` or `launcher right` to choose a sidebar. A second bare `launcher` focuses the one already open. The launcher is a single tab, so opening it again never creates a duplicate. Another argument shows `Usage: launcher [left|right]`.

## Run a command

The command rail shows a label and icon for each configured command. Click a row once to select it, then click it again or press `Enter` to run it. You can also use `↑` and `↓` to choose a row and press `Enter`. Hover a row to see the command it will run. The reply appears below the tab list.

The built-in rail includes Shell, Harness, File navigator, SQL, Notifications, Schedules, Sessions, Conversations, Roles, and Search. It does not include Tasks or History. If a configured command is not recognized, the launcher reports that below the tab list.

## Configure the command rail

The project file `.janissary/launcher.json` holds a JSON array of command entries. Each entry has an `icon`, a `label`, and a `command`:

```json
[
  { "icon": "faTerminal", "label": "Shell", "command": "shell" },
  { "icon": "faBell", "label": "Notifications", "command": "notifications right" }
]
```

The **Configure** button opens the file the launcher currently uses. If it does not exist, the button creates it with the built-in commands first. `janus init` also creates `.janissary/launcher.json` with those commands and leaves an existing file alone. A file at `~/.janissary/launcher.json` replaces the project file. If the effective file is missing, unreadable, invalid JSON, or has no usable entries, the launcher uses its built-in list and reports file problems in [Notifications](/user-documentation/tab-types/notifications). An empty list uses the defaults without an error. If some entries are invalid, it keeps the usable ones and reports how many it dropped. An unknown icon uses a fallback symbol; the command still runs.

You can change the labels, icons, and commands in the JSON file. If two entries use the same `id`, the first stays and later entries with that `id` are dropped. The launcher reports the duplicate in [Notifications](/user-documentation/tab-types/notifications). An entry without an `id` gets one automatically, unless that generated ID is already used by an explicit ID.

The launcher re-reads its active file each time you run `launcher`, and refreshes the rail when the file changes. Configure opens the active file in an editor tab. The **Open ACP transcript** button opens the launcher's transcript in an editor tab.

<img class="agent-float left" src="/agents/hamza-south.png" alt="" />

## Find an open tab

The lower list shows tabs from the center strip, arranged by tab group and then by status: **needs you**, **unread**, **active**, **working**, and **idle**. A tab that needs your answer appears first. Tabs keep their strip order within a status group, and empty status groups are hidden. Docked tabs and the launcher itself do not appear in this list.

Use `↑` and `↓` to move through the rows, then press `Enter` to focus the selected tab. You can also click a row. Press `Tab` or `Shift+Tab` to move keyboard focus between the command rail and tab list.

Each row shows the tab's name, its unread flag when needed, and how long ago it was last active. Other tab types also show their type; shell, harness, and SSH rows use a summary instead. The time stays blank until a tab has been active, then grows from minutes to hours to days. It updates while the launcher is visible and pauses while it is hidden. Groups follow their first appearance in the center strip. Within each group, rows keep their strip order inside the **needs you**, **unread**, **active**, **working**, and **idle** tiers. Empty tiers are hidden, and the group name is not shown. A row click focuses that tab and starts the same three-second unread dwell as the tab strip.

The **needs you** group contains a pending agent question or a harness permission prompt the application cannot answer for you. A permission prompt the application is handling, or a tab waiting for an already-scheduled resume, does not appear in this group.

The summarizer uses the project's `ai/personas/launcher/summarizer.md` when present, or Janissary's built-in persona otherwise. It reads changed center tabs about every 30 seconds, using up to eight recent transcript entries; it doesn't summarize docked tabs, other tab types, or the launcher itself. Its session has no tools, and each summary is limited to 400 characters. A summary appears only after one arrives, stays until replaced by new activity or the tab closes, and is cleared when you close the launcher. It is clamped to three lines, with up to eight lines shown while you hover. With a keyboard-selected row, press `→` to expand its summary and `←` to collapse it; moving selection collapses the previous row.
