### search

Open project search or search for a phrase. Use the transcript form to search transcript text.

**Usage**

`search`

`search <phrase>`

`search transcript <pattern>`

**Use cases**

- Find text across project files.
- Search the current transcript for a pattern.
- Search a workspace from a workspaced tab.

**Examples**

- `search` opens project search.
- `search TODO` searches for the phrase `TODO`.
- `search transcript error` searches the transcript for `error`.

**Notes**

- In a shell tab, `search transcript <pattern>` opens the find overlay over the terminal's transcript with the pattern entered, the same overlay `Cmd+F` opens there.
- When `search` is disabled in the Commands tab, bare `search` is refused with the server's `Command is disabled: search.` output, and `Cmd+Shift+F` is blocked. `search transcript` is refused instead of opening the find overlay, while `Cmd+F` still opens the empty find.
