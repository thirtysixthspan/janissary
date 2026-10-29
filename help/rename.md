### rename

Set the current tab's display name. Bare `rename` clears the display alias. In an editor tab, `rename <name>` renames the file instead.

**Usage**

`rename <name>`

`rename`

**Use cases**

- Give a tab a recognizable display name.
- Restore the tab's original label by clearing its alias.
- Rename the file an editor tab is editing.

**Examples**

- `rename review notes` renames the current tab's display name to `review notes`.
- `rename` clears the current tab's alias.
- `rename notes.txt` in an editor tab renames the file to `notes.txt`. Bare `rename` leaves the file alone.

The name `system` is reserved. `rename system` prints `Cannot use "system": that name is reserved for the system tab.` and changes nothing. In an editor tab, a name that is already taken or contains a path separator prints `Could not rename <old> to <new>.` with the reason, and the file stays as it was.
