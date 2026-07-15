# Tab Navigator

A fuzzy-searchable jump list for switching directly to any open tab by typing part of its label or number.

### Opening the navigator

`Ctrl+G` (or the `nav` command, optionally followed by a query, e.g. `nav depl`) opens a modal window listing every open tab — agent, harness, SSH, viewer, and reporting tabs alike — floating above the command bar. If the navigator is already open, `Ctrl+G` or `nav` closes it again instead of reopening it.

### Filtering

Typing narrows the list to tabs whose displayed name (its alias if renamed, otherwise its label) contains the typed text anywhere (case-insensitive), or whose tab number starts with it. The matched portion of the displayed name is highlighted. Number matches are listed first, followed by name matches, each group sorted alphabetically by displayed name. Running `nav <query>` opens the navigator pre-filtered to `<query>` instead of sending the text as a command. When nothing matches, the window shows a `(no matching tabs)` placeholder.

### Renamed tabs

A tab renamed with `rename` (see the tab strip's alias) shows and matches by its alias in the navigator, the same way it does in the tab strip — its underlying routing label still exists but is not what's displayed or searched.

### Selecting a tab

`Up`/`Down` (or `Ctrl+P`/`Ctrl+N`) move the highlighted selection through the filtered list. `Return` jumps to the highlighted tab and closes the navigator. A row can also be clicked to jump to it directly. `Escape` closes the navigator without changing the active tab.

### Data source

The navigator reads the same tab list already shown in the tab strip; opening it does not request anything new from the server. Selecting a tab sends the same activation used by clicking a tab in the strip.
