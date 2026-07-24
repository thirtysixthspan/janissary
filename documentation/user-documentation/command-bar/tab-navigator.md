# Tab navigator

<img class="agent-float" src="/agents/cavus-south-east.png" alt="" />

With several tabs open, `Ctrl+G` (or the `nav` command) jumps straight to any of them by typing part of its label or number — no need to click through the tab strip or step through `Shift+←`/`Shift+→` one at a time.

<img class="agent-float left" src="/agents/demir-south-west.png" alt="" />
## Opening the navigator

`Ctrl+G` opens a window listing every open tab — agent, harness, SSH, viewer, and reporting tabs alike — floating above the command bar, in the same spot the [history picker](/user-documentation/command-bar/history) appears.

You can also type `nav` at the command bar, optionally followed by a starting query — `nav deploy` opens the navigator already filtered to "deploy". If the navigator is already open, pressing `Ctrl+G` again (or submitting `nav`) closes it instead of reopening it.

## Filtering

Typing narrows the list to tabs whose label contains what you typed anywhere, case-insensitively, or whose tab number starts with it. The matching part of the label is highlighted. Tabs matched by number come first, then label matches, each group sorted alphabetically. If nothing matches, the window shows `(no matching tabs)`.

## Selecting a tab

`↑`/`↓` (or `Ctrl+P`/`Ctrl+N`) move the highlighted selection. `Return` jumps to the highlighted tab and closes the window. A row can also be clicked directly. `Escape` closes the navigator without changing your active tab.

## What it doesn't do

The navigator's filter box isn't a real text field — like the history picker, it reads keys directly, so paste and IME composition aren't supported while typing a query. Backspace and printable characters work as expected.
