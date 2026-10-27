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

`browser open` creates a new window. The optional `name` is accepted but has no effect, and the browser runs headless unless you add `--headed` or `-H`. `browser goto` navigates the current window, opening one automatically if needed. `browser close` closes the current window; `browser close <id>` is an alias for `browser window close <id>`.

**Use cases**

- Open browser windows and switch between them.
- Navigate to a page, inspect its content, run JavaScript, or capture a screenshot.

**Examples**

- `browser open` creates a headless browser window.
- `browser goto https://example.com` navigates the current window to the page.
- `browser content` returns the current page content, and `browser shot` captures its viewport.
- `browser list` shows window ids such as `w1`; `browser use w1` selects that window.
- `browser window close w1` closes that window. Use `browser close` to close the current window.
