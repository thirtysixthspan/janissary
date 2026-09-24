# Agent 

## agent names

The 52 agent names (from `agent-names.json`) are a preset list of lowercase Turkish-origin names: ahmed, akbar, aslan, basir, bekir, bilal, cafer, cahit, cavus, davud, demir, dogan, ekrem, emrah, ersin, farid, fariz, fikri, hakim, hamza, harun, idris, ilyas, imran, jabir, jalal, jamal, kadir, kamil, kasim, latif, lutfi, mahir, malik, murad, omair, orhan, osman, rasim, recep, rifat, sabri, salih, selim, tahir, timur, turan, yahya, yavuz, yusuf.

A project can supply its own `.janissary/agent-names.json` (a JSON array of names) to replace this preset list entirely for that project. If the file is missing, the preset list is used; if it exists but isn't valid JSON, a warning is printed and the preset list is used.

### `agent` command

Creates a new workspaced agent tab with a random unused name from the pool. See the Tabs section.

### `agent <name>` command

Creates a new workspaced agent tab with the specified name. See the Tabs section. `--workspace` (or `-w`) explicitly confirms the default; `--no-workspace` starts the agent in the project checkout instead.

### `on <address>` clause

`agent <name> on <address>` runs the agent's shell on another host over one ssh session, in a
workspace the remote provisions from its own project root. The clause implies `--workspace`, so
`agent bekir on devbox` and `agent bekir -w on devbox` are the same command. The address never
becomes part of the tab name — `agent bekir on devbox` opens a tab called `bekir` — and a bare
`agent on devbox` still picks a random unused name from the pool. See `remote-server.md` for the
address grammar, the authentication flow, and the failure set.

### Name clashes

A name is taken when any of these holds (names compare case-insensitively):

- an open tab, on any host, has that label;
- the sessions tab has a harness or agent row with that name that is provisioning, active, reconnecting, or detached, on any host. Terminated rows, ssh rows, and file-navigator rows never take a name;
- for a remote launch, something with that name is running on the target host (see `remote-server.md`);
- for a local `-w` launch, a live janissary owner still holds the workspace folder of that name: an open tab using it, or a janus instance running inside it. A plain shell sitting in the folder does not count.

A typed name (`agent <name>`) or a profile entry's name is refused when it is taken. The refusal goes to the notifications feed, attributed to the tab the command was typed in, and nothing is written to that tab's transcript. No tab opens for a refused local launch. The lines read:

- `Cannot launch "<name>": a tab named "<name>" is already open.`
- `Cannot launch "<name>": "<name>" is already in the sessions tab (<state> on <host>).`
- `Cannot launch "<name>": "<name>" is already running (<path>).` for a local workspace still in use.

A pool name (bare `agent`, `agent on <address>`, or the ➕ button) skips every taken name. When every pool name is taken, `All agent names are in use.` is posted to the notifications feed and no tab opens.

For a remote launch the target host answers after the placeholder tab is already open. If the host reports a typed name running, the placeholder closes at once and `Cannot launch "<name>": "<name>" is already running on <host>.` is posted. If it reports a pool name running, the placeholder closes and the launch is repeated over a fresh ssh connection under another free pool name, silently, up to 5 attempts in all. After the fifth, `Cannot launch agent on <host>: 5 names tried (<n1>, <n2>, …) are already running on <host>.` is posted.

### Leftover workspaces

A workspace folder under the chosen name with nothing running in it is a leftover. For a local `-w` launch it is removed, even with uncommitted or unpushed work in it, before the clone starts, and `Removed leftover workspace "<name>" (<path>) before launching.` is posted. If it cannot be removed, the launch is refused with `Cannot launch "<name>": could not remove leftover workspace "<name>" (<path>) — <reason>.`. Remote leftovers are handled the same way on the remote host (see `remote-server.md`).
