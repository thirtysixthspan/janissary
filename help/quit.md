### quit

Exit the application after confirming. `/quit` is equivalent; to close a single tab, use `close`.

**Usage**

`quit`

`/quit`

**Use cases**

- Close the entire application when you are finished.
- Confirm and exit when unsaved work is present.

**Examples**

- `quit` opens the quit confirmation.
- `/quit` opens the same confirmation.

Typing `quit` in any tab's command bar asks first, and so does closing the last ordinary tab. Cancel is selected by default; press `y` to quit or `n` or `Escape` to cancel, which puts the cursor back in the command line. If any tab has unsaved changes, the dialog reads "You have unsaved changes. Close anyway?" instead, and confirming discards them. A `quit` that a schedule or another tab sends exits the app without asking.
