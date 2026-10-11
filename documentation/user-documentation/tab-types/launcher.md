# Launcher

<img class="agent-float" src="/agents/idris-south-east.png" alt="" />

Open the launcher to run common commands and jump to a tab from a sidebar.

```
launcher
```

`launcher` opens or focuses the launcher in the left sidebar. Use `launcher left` or `launcher right` to choose a sidebar. A second bare `launcher` focuses the one already open. The launcher is a single tab, so opening it again never creates a duplicate. Another argument shows `Usage: launcher [left|right]`.

## Run a command

The command rail shows a label and icon for each configured command. Click a row once to select it, then click it again or press `Enter` to run it. You can also use `↑` and `↓` to choose a row and press `Enter`. Hover a row to see the command it will run. The reply appears below the tab list.

## Configure the command rail

The project file `.janissary/launcher.json` holds a JSON array of command entries. Each entry has an `icon`, a `label`, and a `command`:

```json
[
  { "icon": "faTerminal", "label": "Shell", "command": "shell" },
  { "icon": "faBell", "label": "Notifications", "command": "notifications right" }
]
```

The **Configure** button opens the file the launcher currently uses. If it does not exist, the button creates it with the built-in commands first. A file at `~/.janissary/launcher.json` replaces the project file. If there is no usable configuration, the launcher uses its built-in list and reports the problem in [Notifications](/user-documentation/tab-types/notifications). If some entries are invalid, it keeps the usable ones and reports how many it dropped. An unknown icon uses a fallback symbol; the command still runs.

With no configuration, the rail includes Shell, Harness, File navigator, SQL, Notifications, Schedules, Sessions, Conversations, [Roles](/user-documentation/tab-types/roles), and Search. You can change the labels, icons, and commands in the JSON file. The launcher reads the active file again when you open it.

<img class="agent-float left" src="/agents/hamza-south.png" alt="" />

## Find an open tab

The lower list shows tabs from the center strip, arranged by tab group and then by status: **needs you**, **unread**, **active**, **working**, and **idle**. A tab that needs your answer appears first. Tabs keep their strip order within a status group, and empty status groups are hidden. Docked tabs and the launcher itself do not appear in this list.

Use `↑` and `↓` to move through the rows, then press `Enter` to focus the selected tab. You can also click a row. Press `Tab` or `Shift+Tab` to move keyboard focus between the command rail and tab list.

Rows show a tab's name, type, activity age, and status. Shell, harness, and SSH tabs in the center strip may also show a short summary of recent activity. A read-only assistant uses recent output to write these summaries and cannot act on your tabs. The launcher checks for changes about every 30 seconds; other tab types do not get summaries. A row keeps its last summary until new activity replaces it or the tab closes.
