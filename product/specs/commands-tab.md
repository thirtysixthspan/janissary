# Commands tab

The Commands tab lists every application command and lets you change which commands are enabled and which native ACP commands agents may use.

### Opening

Type `commands` to open the tab or focus it when it is already open. The tab opens in the center; it never docks itself, though `tab dock` can dock it like any bundled plugin tab. The tab re-reads the effective settings file each time it opens. Commands that change one setting do not open or focus the tab.

### The table

The line above the table names the file being edited, or says `No commands file in effect` when no settings file can be read. A damaged file's problem appears beneath that line. Rows appear in canonical command-name order. A row is labeled by its canonical command name when that name is one of its forms, or when its first fixed form is another row's name; otherwise it shows its first fixed form. The builtin `question` row therefore reads `question` while the native `question ask` row reads `question ask`, and the `ask`/`ask reset`, `tell`/`tell reset`, and `search transcript` rows keep their distinct labels. Every row has an Enabled checkbox; rows for native ACP commands also have an Agent access checkbox, and the Agent access column is present whenever the table has rows.

Checkboxes show the saved setting, not whether the command is currently available. A command whose parent is disabled keeps its saved value and shows `Disabled by parent command: <parent>.`; its row is dimmed and both of its checkboxes are disabled. A native command whose parent denies agent access keeps its saved Agent access value, disables only that checkbox, and shows the same note without dimming the row. A command disabled on its own keeps an interactive Enabled checkbox so it can be turned back on, but its Agent access checkbox stays disabled until it is enabled.

Changing a checkbox saves immediately. Every row that shares the same command setting is disabled while the save is pending, and no other setting is affected. A checkbox does not change until the save succeeds and the new settings arrive. A failed save leaves the last successful value in place and shows the refusal above the table; the next change clears it. A successful save repaints every open Commands tab, including rows that share the command's canonical name.

### Keyboard and layout

Space toggles the focused checkbox through the browser's native control. Up and Down move focus to the same checkbox in the previous or next row, falling back to that row's Enabled checkbox when the matching one is missing or disabled, including while its save is pending, and skipping rows where both are disabled. Focus stops at the first and last rows. Escape and every other key keep their usual meaning.

The table always stays horizontal and scrolls sideways when the tab is narrow, including when the tab has been docked with `tab dock`. See [[application-commands]] for the `commands` command and the settings file.
