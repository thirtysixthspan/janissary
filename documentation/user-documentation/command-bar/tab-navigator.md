# Tab navigator

<img class="agent-float" src="/agents/hamza-south-west.png" alt="" />

With several tabs open, use `Ctrl+G` or `nav` to jump to a visible center tab by matching part of its label or number. This saves you from clicking through the tab strip or stepping through `Shift+←`/`Shift+→` one at a time.

## Opening the navigator

`Ctrl+G` opens a window listing visible center tabs, including harness, SSH, shell, and viewer tabs, floating above the command bar in the same spot the [history picker](/user-documentation/command-bar/history) appears. Hidden tabs, tabs you have [docked into a sidebar](/user-documentation/getting-started/tabs), and a monitor's [reporting tab](/user-documentation/automation/monitoring) are excluded.

You can also submit `nav` at the command bar, optionally followed by a query. For example, `nav deploy` opens the navigator filtered to "deploy". The command bar consumes the whole line to open the navigator; it does not send the query to your tab as a command. If the navigator is already open, pressing `Ctrl+G` again or submitting `nav` with or without a query closes it.

## Filtering

Typing matches any part of a tab's label or alias, without regard to capitalization, or the start of its number. After you [rename a tab](/user-documentation/getting-started/tabs#renaming-a-tab), its alias is displayed and searchable; its original label remains searchable too. A matching part is highlighted when it appears in the displayed name. Tabs matched by number come first, then name matches, each group sorted alphabetically. If nothing matches, the window shows `(no matching tabs)`.

## Selecting a tab

`↑`/`↓` (or `Ctrl+P`/`Ctrl+N`) move the highlighted selection. `Return` jumps to the highlighted tab and closes the window. A row can also be clicked directly. `Escape` closes the navigator without changing your active tab.

## What it doesn't do

The navigator's filter box isn't a real text field. Like the history picker, it reads keys directly, so paste and IME composition aren't supported while typing a query. Backspace and printable characters work as expected.
