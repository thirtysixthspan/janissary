### tab

Focus a tab or arrange tabs by their name in the strip. Each form targets the first tab whose label or display alias matches, ignoring case; hidden tabs are included.

**Usage**

`tab focus <name>`

`tab move <tab> <position>`

`tab pane <tab> left|right`

`tab split <tab>`

`tab color <tab> <#rrggbb>`

`tab group <tab> <id|name>`

`tab dock <tab> left|right`

`tab undock <tab>`

Quote a target with single or double quotes when its name contains spaces. A quote may begin in the middle of a token, and a backslash escapes the matching quote inside a quoted name. An empty quoted name is invalid. A missing target prints `No tab named "<name>".`

**Use cases**

- `focus` selects a tab and reveals a hidden system tab, undocking it into the center if needed.
- `move` reorders a tab at a 1-based position. Center tabs move within their group and pane; visible docked tabs move among every tab on the same sidebar; reporting tabs move among reporting tabs. A hidden tab uses its group-and-pane order even while docked and stays hidden. A position past the end puts the tab last.
- `pane` moves a tab to the named pane, opening or collapsing a split as needed. `split` moves it to the other pane.
- `color` sets a tab's dot to the six-digit color as typed, without changing its group's band color.
- `group` moves a tab into an existing group or creates a group by name or positive ID. A new group name gets the next available ID; an unknown numeric ID is named `group-<id>`.
- `dock` puts a file navigator, notifications tab, or bundled-plugin tab in a sidebar. It displaces an existing tab of the same kind on that side. `undock` returns a visible docked tab to the focused pane without changing focus.

Successful commands print nothing. An arrangement that is already complete prints nothing and sends no state update. Arranging a tab leaves focus unchanged, except that docking the active tab moves focus to the nearest center tab; if there is no center tab, undocking one activates it.

Refusals send a `tab` notification and do not write to the command transcript:

- `Cannot dock "<name>".` when the tab cannot be docked or is the last visible center tab.
- `Cannot group "<name>".` for a monitor reporting tab.
- `Cannot move "<name>" to a pane.` when the tab cannot move to a pane or an unsplit strip has fewer than two eligible tabs.
- `Cannot undock "<name>".` for a hidden tab.

**Examples**

- `tab focus bilal` focuses the tab labelled `bilal`.
- `tab focus "review notes"` focuses a tab with a spaced label or display alias.
- `tab move "review notes" 2` puts that tab in the second position among its strip mates.
- `tab pane janus right` moves `janus` to the right pane.
- `tab split "review notes"` moves that tab to the other pane.
- `tab color "review notes" #FF8800` sets its dot color.
- `tab group "review notes" scratch` moves it to the `scratch` group, creating the group if needed.
- `tab dock "review notes" left` docks it on the left if its tab kind supports docking.
- `tab undock "review notes"` returns a visible docked tab to the center.
- `tab focus review notes` prints `Usage: tab focus <name>.`; quote a name containing spaces.

Malformed known forms print their matching usage line. Bare `tab` and unknown subcommands print the summary usage:

```
Usage: tab focus <name>.
Usage: tab move <tab> <position>.
Usage: tab pane <tab> left|right.
Usage: tab split <tab>.
Usage: tab color <tab> <#rrggbb>.
Usage: tab group <tab> <id|name>.
Usage: tab dock <tab> left|right.
Usage: tab undock <tab>.
Usage: tab focus|move|pane|split|color|group|dock|undock <tab> [argument].
```
