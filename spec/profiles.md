## Profiles

A profile is a reusable, named set of agents for a particular use case (writing code, surfing the web, authoring a book, a specific task). Profiles are managed by `src/profiles.ts` and the `profile` command (`src/commands/profile.ts`).

### Storage

Profiles live in a top-level `profiles/` directory (`initProfileDir` in `src/cli.tsx`), kept separate from `.janissary/` so they are committable and are **not** cleared on launch. Each profile is its own directory named in dasherized text (e.g. `writing-code/`), containing one `<agentname>.json` file per agent. Each file uses the agent-state schema — the same format as `.janissary/state/<name>.json`. The filename (minus `.json`) is the authoritative agent name and overrides any `name` field inside the file.

### `profile launch <name>`

Opens a tab for each agent in the named profile. For each agent file, its state is written into the live state dir and the agent is initialized (`initAgentState`) and restored into a new tab — recovering its command history, transcript, working directory, schedule, and dot color (the profile's `dotColor` is used when it is distinct enough from the colors already on screen, otherwise the most distinct palette color is chosen) — then focus moves to the first newly opened tab. Agents are opened in `number` order. An agent whose label is already open as a tab is skipped (reported as `Already open: …`). A missing profile returns `No profile named "<name>".` and an empty one returns `Profile "<name>" has no agents.`.

All of a launched profile's agents are placed into a single **new group** (the next free group number, or a group number authored on the profile's agent files), kept contiguous in the tab strip. The group's bar color is fixed to the first opened agent's color and shared by the rest, so a profile's tabs read as one band distinct from the root group and from other profiles. See Tab grouping.

### `profile list`

Lists the available profile directory names (sorted), or `No profiles.` when none exist.

### `profile` command

`profile` launches a saved set of agents. See the Profiles section. `profile launch <name>` opens a tab for each agent in the named profile (restoring its agent state), skipping agents already open; `profile list` lists the available profiles. Malformed invocations return a `Usage:` message.

