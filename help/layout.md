### layout

Set the application window, a sidebar, the center split, or the reporting area's size. `layout show` prints the current sizes as commands you can run again.

**Usage**

`layout window <width> <height>`

`layout sidebar left|right <width>`

`layout split <percent>`

`layout reporting <percent>`

`layout show`

Window and sidebar dimensions are pixels. Split and reporting dimensions are percentages. The split percentage is the left pane's share; the reporting percentage is the lower reporting area's share.

**Use cases**

- Set layout sizes from a command, schedule, or runscript.
- Print the current sizes as a reusable command sequence.

**Examples**

- `layout window 1440 900` resizes the application window.
- `layout sidebar left 400` sets the left sidebar's width, even while it is hidden.
- `layout split 60` gives the left pane 60% of the center area when a split is showing.
- `layout reporting 25` gives the reporting area 25% of the height.
- `layout show` prints commands for the current window, sidebars, split, and reporting area.

Successful size changes print nothing. `layout split` with no split showing prints `No split is showing.` Invalid forms print the usage line. If no window is open, window sizing does nothing; a failed resize or read appears in the notifications feed.
