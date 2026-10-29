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
- `browser content` returns the page title and the raw text of the page body, including hidden text, cut off at 10,000 characters. `browser shot` captures the viewport and prints `Screenshot saved: <path>`.
- `browser list` shows window ids such as `w1`; `browser use w1` selects that window. With no window open, it answers `No browser windows.`
- `browser use w9` answers `No browser window w9.` when that window doesn't exist.
- `browser window close w1` closes that window. `browser close` closes the current window, and `browser close w1` is an alias for `browser window close w1`.
- `browser close` with no window open answers `No browser window to close.`, and `browser close w9` answers `No open connection browser:w9.` when that window doesn't exist.
- A bare `browser` or an unknown subcommand prints `Usage: browser <open [name] [--headed]|list|use <id>|goto <url>|eval <js>|shot|content|close [id]|window close <id>>`. A missing argument gets a shorter line, such as `Usage: browser goto <url>`, `Usage: browser eval <js>`, `Usage: browser use <id>`, or `Usage: browser window close <id>`.
