### connection

Open the connections tab, or open a live connection or retained ACP/agent session by its connection string, UUID, or title. `connection` is the singular alias of `connections`.

**Usage**

`connection`

`connection list`

`connection close <connection>`

`connection <text>`

**Use cases**

- Reopen a retained ACP or agent session by its complete title or its list name.
- Focus a live connection's owning tab.
- List or close a live connection.

**Examples**

- `connection` opens or focuses the connections tab.
- `connection list` lists open connections.
- `connection close shell:bash` closes the matching shell connection.
- `connection ACP: explain this test` opens the retained ACP session whose complete title matches.
- `connection acp: explain this test` matches the same title ignoring letter case.

**Notes**

- Both `connection` and `connections` accept the same lookup. Matching ignores letter case but compares the complete stored title, including its `ACP:` or `Agent:` prefix and every interior space, newest first. It is not a prefix, substring, fuzzy, or whitespace-normalized match.
- Quotation marks are not syntax. Write the title as it is, without wrapping it.
- `connections` is the only name that docks. `connection left` and `connection right` are lookup text. Run `help connections` for docking and the full command grammar.
- `connection close` completes no target, unlike plural `connections close`.
- Lookup also accepts a retained record's exact UUID, a live `<kind>:<id>` connection, and, last of all, the name the connections list shows for a record, such as `acp:<tab name>`, ignoring letter case. A failed lookup reports exactly `No connection matching "<text>".`
- The connections list header holds **Refresh** and **Split** at its right edge, where **Split** moves the list into the other pane. Refresh with arguments is refused with `invalid refresh payload`, and Refresh sent from a connection tab is refused with `refresh applies only to the connections list`.
- In a connection tab, **Focus tab** is refused with `The owning tab is no longer open.` once the tab that started the record has closed, and with `invalid focus payload` when it carries anything but a record id.
