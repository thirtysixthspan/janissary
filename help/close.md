### close

Close the current tab, or name a tab to close it. Closing the last tab exits the application, after confirmation. Docked tabs and the `system` shell tab don't count as tabs for this. `/exit` is an alias of `/close`.

**Usage**

`close`

`close <tabname>`

`/close`

`/exit`

**Use cases**

- Close the tab you are using.
- Close a different tab by its label or display alias.
- Cancel a dirty named close to keep the tab open and return to its editor.

**Examples**

- `close` closes the current tab.
- `close page-2` closes the tab labelled `page-2`.
- If `close alpha.txt` opens a save dialog while another tab is current, pressing Escape activates `alpha.txt` and returns focus to its editor.
