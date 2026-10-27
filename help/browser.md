### browser

Control a browser from the command bar. Open and select browser windows, navigate to pages, inspect content, run JavaScript, or capture screenshots.

**Usage**

`browser open [name] [--headed|-H]`

`browser list`

`browser use <id>`

`browser goto <url>`

`browser eval <js>`

`browser shot`

`browser content`

`browser close [id]`

`browser window close <id>`

**Use cases**

- Open browser windows and switch between them.
- Navigate to a page, inspect its content, run JavaScript, or capture a screenshot.

**Examples**

- `browser open` creates a new window and runs headless by default. Its optional `name` has no effect; add `--headed` or `-H` to show the window.
- `browser goto https://example.com` navigates the current window to the page, opening a window automatically if needed.
- `browser content` returns the current page content, and `browser shot` captures its viewport.
- `browser list` shows window ids such as `w1`; `browser use w1` selects that window.
- `browser window close w1` closes that window. `browser close` closes the current window, and `browser close w1` is an alias for `browser window close w1`.
