### layout

Set the application window, a sidebar, the center split, or the reporting area's size. `layout show` prints the current sizes as commands you can run again.

**Usage**

`layout window <width> <height>`

`layout sidebar left|right <width>`

`layout split <percent>`

`layout reporting <percent>`

`layout show`

Window and sidebar dimensions are positive whole-number pixels. Split and reporting dimensions are whole-number percentages: split accepts 1–99, and reporting accepts 0–100. The split percentage is the left pane's share; the reporting percentage is the lower reporting area's share. Command forms and sidebar sides are case-insensitive. A number with a sign, a decimal point, or too many digits to be a safe whole number is invalid.

**Use cases**

- Set layout sizes from a command, schedule, or runscript.
- Print the current sizes as a reusable command sequence.

**Examples**

- `layout window 1440 900` resizes the application window.
- `layout sidebar left 400` sets the left sidebar's width, even while it is hidden.
- `layout split 60` gives the left pane 60% of the center area when a split is showing.
- `layout reporting 25` gives the reporting area 25% of the height.
- `layout show` prints commands for the current window, sidebars, split, and reporting area.

Successful size changes print nothing. `layout split` with no split showing prints `No split is showing.` Invalid forms print `Usage: layout window <width> <height> | sidebar left|right <width> | split <percent> | reporting <percent> | show.` Tab completes the subcommands and the sidebar side. Any later argument uses ordinary file-path completion.

Sizes are applied exactly as given. The command doesn't apply the limits the drag handles enforce, and it doesn't check the numbers against your screen. Every connected window receives the change. With no window connected, the change is dropped. If a window resize fails, notifications show `Could not resize the window: <reason>.`

`layout show` rounds sizes to whole numbers and prints them in window, left sidebar, right sidebar, split, reporting order. It omits the window when no application window is open and omits the split when no split is showing. Sidebar and reporting sizes appear when a client has reported them. If no sizes are available, it sends `No layout to show.` to notifications. A failed window-size read sends `Could not read the window size: <reason>.` to notifications; other available sizes still print when a read fails. When no window is open, window sizing does nothing silently.
