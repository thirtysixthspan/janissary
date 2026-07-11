## Profiles

A profile is a reusable, named set of agents and/or AI harnesses for a particular use case (writing code, surfing the web, authoring a book, a specific task). Profiles are managed by `src/profiles.ts` and the `profile` command (`src/commands/profile.ts`).

### Storage

Profiles live in a top-level `profiles/` directory (`initProfileDir` in `src/cli.tsx`), kept separate from `.janissary/` so they are committable and are **not** cleared on launch. Each profile is its own directory named in dasherized text (e.g. `writing-code/`), containing one `<name>.json` file per entry — an agent or a harness. The filename (minus `.json`) is the authoritative tab label and overrides any `name` field inside the file.

An agent entry uses the agent-state schema — the same format as `.janissary/state/<name>.json`. A harness entry is distinguished by a `harness` key naming the harness to launch (`claude`, `opencode`, or `codex`) and supports:

- **model** — passed to the harness binary's `--model` flag, verbatim. Validated at launch against the known model catalog for that harness; an unknown model is reported (`Unknown model "<model>" for harness "<harness>" — add it to harness-models.json.`) and the entry is skipped, same as an unknown harness name.
- **number** — tab-order, same as agent entries.
- **dotColor** — same handling as agent entries.
- **workspace** — launch in a fresh workspace clone (default false), like `harness <name> --workspace`.
- **cwd** — starting directory (default: the issuing tab's cwd).
- **run** — a list of commands typed into the harness once, shortly after launch (each becomes a one-shot schedule entry that fires on the first scheduler tick and then disappears from the schedule panel).
- **schedule** — a list of authored schedule lines in the `schedule` command grammar, minus the `in <tab>` clause (the tab is implicitly this entry's own tab). A line that fails to parse, or that includes an `in <tab>` clause, is reported in the launch output and skipped; a duplicate schedule name within one entry keeps the first and reports the rest.

A harness entry's schedule and one-shot `run` commands are **memory-only**: harness tabs have no persisted agent state, so closing the tab, quitting the app, or the harness process exiting ends the loop, and `--relaunch` does not restore it (see Harness Tab § Lifecycle). Re-running `profile launch <name>` recreates the whole setup from the profile file, which remains the single source of truth.

### `profile launch <name>`

Typing bare `profile launch` (no name) opens a picker listing the available profiles,
mirroring the `tasks` picker's interaction: arrow keys move the selection, Enter or a
click populates the command line with `profile launch <name>` without submitting it (so
it can be reviewed or edited first), and Escape closes it.

Opens a tab for each entry in the named profile, in `number` order. For an agent entry, its state is written into the live state dir and the agent is initialized (`initAgentState`) and restored into a new tab — recovering its command history, transcript, working directory, schedule, and dot color (the profile's `dotColor` is used when it is distinct enough from the colors already on screen, otherwise the most distinct palette color is chosen). For a harness entry, a harness tab is opened directly (see Harness Tab) with the entry's model, starting directory, and workspace flag; it is never persisted to agent state. Once every entry is opened, focus moves to the first newly opened tab. A missing profile returns `No profile named "<name>".` and an empty one returns `Profile "<name>" has no agents.`.

**Relaunching.** A profile may be launched more than once. Before opening any entry, every currently open tab whose label matches an entry in the profile is closed first (killing its PTYs/shells, dropping its schedule, and removing its workspace clone), and then every entry opens fresh — so a relaunch always gets a new process, a schedule re-based to "now", and a new workspace clone where applicable. The one exception is the tab `profile launch` was issued from: it is never closed, and if the profile names an entry matching its label, that entry is reported and skipped instead, so the launch report always has a tab to land in.

All of a launched profile's entries are placed into a single **new group** (the next free group number, or a group number authored on one of the profile's agent files), kept contiguous in the tab strip. The group's bar color is fixed to the first opened entry's color and shared by the rest, so a profile's tabs read as one band distinct from the root group and from other profiles. See Tab grouping.

### `profile list`

Lists the available profile directory names (sorted), or `No profiles.` when none exist.

### `profile` command

`profile` launches a saved set of agents and harnesses. See the Profiles section. `profile launch <name>` opens a tab for each entry in the named profile (restoring agent state, or launching a harness), closing and reopening any tab that collides with a relaunch; `profile list` lists the available profiles. Malformed invocations return a `Usage:` message.

