### quit

Exit the application after confirming. `/quit` is equivalent; to close a single tab, use `close`.

**Usage**

`quit`

`/quit`

**Use cases**

- Close the entire application when you are finished.
- Save or discard each tab's unsaved work, then exit.

**Examples**

- `quit` opens the quit confirmation.
- `/quit` opens the same confirmation.

Typing `quit` in any tab's command bar asks first, and so does closing the last ordinary tab. When no tab has unsaved work, **Cancel** is selected by default; press `y` to quit or `n` or `Escape` to cancel, which returns focus to the command bar that submitted `quit`. When work is unsaved, the app asks about each such tab in tab-strip order with the same **Save (y)**, **Don't Save (n)**, and **Cancel (Esc)** dialog used when closing one tab; its title names the tab. **Save** writes before the walk moves on, while **Don't Save** leaves that tab's edits until the app exits. **Save** is selected first and the selection carries to the next tab. Cancel or a failed save stops the quit and leaves the app open with that tab focused. Once every such tab is answered, the app exits. A `quit` that a schedule or another tab sends exits the app without asking.
