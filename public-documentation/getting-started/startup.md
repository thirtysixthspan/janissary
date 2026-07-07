# Starting the app

See [Prerequisites](/getting-started/prerequisites) if you haven't set up Janissary yet. Run `janus` from the directory you want to work in:

```
npx janus
```

Or install it globally first:

```
npm install -g janissary
janus
```

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

By default each launch starts fresh: a single `janus` tab, with any state from the previous session cleared. To pick up where you left off instead, use `--relaunch` (below).

## Flags

| Flag | What it does |
|---|---|
| `--port=<n>` | Listen on port `n` (1–65535). Without it, a free port is picked automatically. |
| `--no-open` | Start the server without opening the app window. |
| `--relaunch` | Restore the previous session instead of starting fresh. |
| `--help` | Print usage and exit. |
| `--version` | Print the name and version and exit. |

A mistyped flag, a bare `--port` with no value, or a port outside 1–65535 stops the launch with an error and a pointer to `--help` — nothing is started and no state is touched.

## Resuming a session with `--relaunch`

```
janus --relaunch
```

<img class="agent-float left" src="/agents/hakim-south-east.png" alt="" />

`--relaunch` rebuilds your tabs as you left them: every agent tab comes back in its saved order with its dot color, group, transcript, command history, and working directory. Tab aliases and scheduled commands are restored too. What doesn't come back: view tabs (images, Markdown, editors, web pages), harness tabs, and workspace clones — those are live views and processes, not saved state.

## Troubleshooting

If startup fails, the error names the app and version, says what went wrong, and suggests what to do next. The two you're most likely to see:

- **The port is already in use** — something else is listening on the port you asked for. Pick another with `--port=<n>`, or drop `--port` entirely and let the app choose a free one.
- **The web UI bundle is missing** — this only happens in a development checkout where the web assets haven't been built yet. Run `npm run build:web` (or `npm start`) and launch again.

## Configuration

Settings live in `.janissary/config.json` inside the directory you launch from; a default file is created on first launch. All three settings are editable:

| Setting | Default | What it does |
|---|---|---|
| `transcriptMaxLines` | `25000` | How many transcript entries each tab keeps. Past the cap, the oldest entries are dropped. |
| `tabNameMaxLength` | `16` | The longest allowed tab name, applied when tabs are created or renamed. |
| `syntaxTheme` | `"github-dark"` | The syntax-highlighting theme for [editor tabs](/tab-types/editor). Change it at runtime with `syntax theme <name>`. |

If the file isn't valid JSON, the app warns on startup and falls back to defaults for that session — your file is left untouched so you can fix it.
