# Agent 

## agent names

The 52 agent names (from `agent-names.json`) are a preset list of lowercase Turkish-origin names: ahmed, akbar, aslan, basir, bekir, bilal, cafer, cahit, cavus, davud, demir, dogan, ekrem, emrah, ersin, farid, fariz, fikri, hakim, hamza, harun, idris, ilyas, imran, jabir, jalal, jamal, kadir, kamil, kasim, latif, lutfi, mahir, malik, murad, omair, orhan, osman, rasim, recep, rifat, sabri, salih, selim, tahir, timur, turan, yahya, yavuz, yusuf.

A project can supply its own `.janissary/agent-names.json` (a JSON array of names) to replace this preset list entirely for that project. If the file is missing, the preset list is used; if it exists but isn't valid JSON, a warning is printed and the preset list is used.

### `agent` command

Creates a new agent tab with a random unused name from the pool. See the Tabs section.

### `agent <name>` command

Creates a new agent tab with the specified name. See the Tabs section. Add `--workspace` (or `-w`) to clone the root repo into a disposable workspace at `.janissary/workspace/<name>/`.

### `on <address>` clause

`agent <name> on <address>` runs the agent's shell on another host over one ssh session, in a
workspace the remote provisions from its own project root. The clause implies `--workspace`, so
`agent bekir on devbox` and `agent bekir -w on devbox` are the same command. The address never
becomes part of the tab name — `agent bekir on devbox` opens a tab called `bekir` — and a bare
`agent on devbox` still picks a random unused name from the pool. See `remote-server.md` for the
address grammar, the authentication flow, and the failure set.
