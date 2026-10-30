### nav

Open the tab navigator with `nav`; add a query to filter it. The query matches any part of a tab label or alias, or the start of its number, without regard to case. If the navigator is already open, submitting `nav` with or without a query closes it.

**Usage**

`nav [query]`

When the navigator is closed, the command bar consumes `nav <query>` to open it with that filter instead of sending the line to the current tab as a command.

**Use cases**

- Find a tab by typing part of its name.
- Open the navigator already filtered to a query.

**Examples**

- `nav` opens the tab navigator.
- `nav review` opens it with `review` pre-filled.
