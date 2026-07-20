## Profiles

A profile is a reusable, named set of agents and/or AI harnesses for a particular use case (writing code, surfing the web, authoring a book, a specific task). Profiles are managed by `src/profiles.ts` and the `profile` command (`src/commands/profile.ts`).

### Storage

Profiles live in a top-level `profiles/` directory (`initProfileDir` in `src/cli.tsx`), kept separate from `.janissary/` so they are committable and are **not** cleared on launch. Each profile is its own directory named in dasherized text (e.g. `writing-code/`), containing one `<name>.json` file per entry — an agent or a harness. The filename (minus `.json`) is the authoritative tab label and overrides any `name` field inside the file.

A file whose name begins with an underscore is **not** an entry — it is reserved profile-level configuration (see Profile-level monitors below) and is skipped when loading entries.

An agent entry uses the agent-state schema — the same format as `.janissary/state/<name>.json`. A harness entry is distinguished by a `harness` key naming the harness to launch (`claude`, `opencode`, or `codex`) and supports:

- **model** — passed to the harness binary's `--model` flag, verbatim. Validated at launch against the known model catalog for that harness; an unknown model is reported (`Unknown model "<model>" for harness "<harness>" — add it to harness-models.json.`) and the entry is skipped, same as an unknown harness name.
- **effort** — the effort level, verbatim, like `harness <name> --effort <level>`. Not validated against any fixed set of levels, and translated to whichever flag the target harness understands (claude `--effort`, codex `-c model_reasoning_effort=<level>`, opencode has none and drops it).
- **number** — tab-order, same as agent entries.
- **dotColor** — same handling as agent entries.
- **workspace** — launch in a fresh workspace clone (default false), like `harness <name> --workspace`.
- **autoApprove** — auto-approve the harness's own permission prompts, like `harness <name> -y/--yes`. Claude-only and requires `workspace` (auto-approval is only allowed in a sandboxed clone); an entry that sets it without a claude workspace is reported and skipped, same as an unknown harness or model.
- **offline** — add a network-deny rule to the tab's sandbox profile, like `harness <name> --offline` (only meaningful alongside `workspace`).
- **group** — an explicit group number for the whole profile (see Tab grouping below), same as an agent entry's `group`.
- **cwd** — starting directory (default: the issuing tab's cwd).
- **run** — a list of commands typed into the harness once, shortly after launch (each becomes a one-shot schedule entry that fires on the first scheduler tick and then disappears from the schedule panel).
- **schedule** — a list of authored schedule lines in the `schedule` command grammar, minus the `in <tab>` clause (the tab is implicitly this entry's own tab). A line that fails to parse, or that includes an `in <tab>` clause, is reported in the launch output and skipped; a duplicate schedule name within one entry keeps the first and reports the rest.

A harness entry's schedule and one-shot `run` commands are **memory-only**: harness tabs have no persisted agent state, so closing the tab, quitting the app, or the harness process exiting ends the loop, and `--relaunch` does not restore it (see Harness Tab § Lifecycle). Re-running `profile launch <name>` recreates the whole setup from the profile file, which remains the single source of truth.

A harness entry's `run`/`schedule` commands are typed into the harness's own terminal, so they must be things that harness understands — not janissary commands. To start a janissary-level construct like a monitor as part of a profile, use the profile-level monitors file below.

### Profile-level monitors

A profile may declare monitors in a reserved `_monitors.json` file at the profile root (the leading underscore keeps it out of the entry set — it is not an agent or harness tab). The file is a JSON array of `{ persona, targets }` objects, where `targets` is a list of authored target words in the `monitor` command grammar (`group:<n>` or a tab label; an empty list is inline mode). Once every profile entry is open, each monitor is started from the tab `profile launch` was issued from as `monitor <persona> <targets…>`, so its targets resolve against the complete tab list (including the just-opened entries). Being owned by the issuing tab rather than by a profile entry, a monitor keeps running when the profile's own tabs are closed; it stops when the issuing tab closes or via `unmonitor` from that tab.

Starting is **idempotent across relaunch**: before starting each monitor, any existing monitor with the same owner and persona is stopped, so re-running `profile launch <name>` refreshes the monitors rather than reporting `Already monitoring with persona "<persona>"`. Each monitor's outcome — started (with its resolved targets) or the parse/validation error that skipped it — is included in the launch report. Malformed elements in `_monitors.json`, and the file being absent, unparseable, or not an array, are treated as no monitors.

### Profile-level file navigator

A profile may declare one or more file-tree tabs to open in a reserved `_files.json` file at the profile root (kept out of the entry set the same way `_monitors.json` is). The file is a JSON array of `{ dock?, in?, path? }` objects: `dock` docks the tree into that sidebar (`left`/`right`); `in` roots it at the cwd of the named tab instead of the default; `path` roots it at a literal path, expanded the same way the `files` command's path argument is — so `$root` roots the tree at the launch directory regardless of which tab the profile opened. Once every profile entry is open, each is opened as `files [in <in>] [on <dock>] [<path>]`, with `in` defaulting to the profile's first newly opened tab when omitted — so an entry with no `in` and no `path` shows that tab's own workspace, while an absolute `path` such as `$root` is independent of that tab. Because a docked tree is never the active tab, opening and docking one of these can move focus away from the first newly opened tab to the nearest non-docked tab — the same invariant `files left`/`files right` already has outside of profiles. The `claude` profile uses this to open a file navigator rooted at `$root` docked into the left sidebar.

### Profile-level notifications tab

A profile may declare that the notifications tab should open on launch in a reserved `_notifications.json` file at the profile root (kept out of the entry set the same way `_monitors.json` and `_files.json` are). The file is a JSON array of `{ dock? }` objects, where `dock` docks the feed into that sidebar (`left`/`right`). Once every profile entry is open, each entry opens or docks the singleton notifications tab, mirroring the `notifications [left|right]` command. Because the notifications tab is a singleton, more than one entry simply re-docks the same feed. Malformed elements in `_notifications.json`, and the file being absent, unparseable, or not an array, are treated as no notifications tab. The `claude` profile uses this to open notifications docked into the right sidebar.

### Profile-level schedules tab

A profile may declare that the schedules tab should open on launch in a reserved `_schedules.json` file at the profile root (kept out of the entry set the same way `_monitors.json`, `_files.json`, and `_notifications.json` are). The file is a JSON array of `{ dock? }` objects, where `dock` docks the list into that sidebar (`left`/`right`). Once every profile entry is open, each entry opens or docks the singleton schedules tab, mirroring the `schedules [left|right]` command. Because the schedules tab is a singleton, more than one entry simply re-docks the same list. Malformed elements in `_schedules.json`, and the file being absent, unparseable, or not an array, are treated as no schedules tab. The `claude` profile uses this to open schedules docked into the right sidebar.

### `profile launch <name>`

Typing bare `profile launch` (no name) opens a picker listing the available profiles,
mirroring the `tasks` picker's interaction: arrow keys move the selection, Enter or a
click populates the command line with `profile launch <name>` without submitting it (so
it can be reviewed or edited first), and Escape closes it.

Opens a tab for each entry in the named profile, in `number` order. For an agent entry, its state is written into the live state dir and the agent is initialized (`initAgentState`) and restored into a new tab — recovering its command history, transcript, working directory, schedule, and dot color (the profile's `dotColor` is used when it is distinct enough from the colors already on screen, otherwise the most distinct palette color is chosen). For a harness entry, a harness tab is opened directly (see Harness Tab) with the entry's model, starting directory, and workspace flag; it is never persisted to agent state. Once every entry is opened, focus moves to the first newly opened tab. A missing profile returns `No profile named "<name>".` and an empty one returns `Profile "<name>" has no agents.`.

**Relaunching.** A profile may be launched more than once. Before opening any entry, every currently open tab whose label matches an entry in the profile is closed first (killing its PTYs/shells, dropping its schedule, and removing its workspace clone), and then every entry opens fresh — so a relaunch always gets a new process, a schedule re-based to "now", and a new workspace clone where applicable. The one exception is the tab `profile launch` was issued from: it is never closed, and if the profile names an entry matching its label, that entry is reported and skipped instead, so the launch report always has a tab to land in.

All of a launched profile's entries are placed into a single **new group** (the next free group number, or a group number authored on any of the profile's entries — agent or harness), kept contiguous in the tab strip. The group's bar color is fixed to the first opened entry's color and shared by the rest, so a profile's tabs read as one band distinct from the root group and from other profiles. See Tab grouping.

### `profile list`

Lists the available profile directory names (sorted), or `No profiles.` when none exist.

### `profile` command

`profile` launches a saved set of agents and harnesses. See the Profiles section. `profile launch <name>` opens a tab for each entry in the named profile (restoring agent state, or launching a harness), closing and reopening any tab that collides with a relaunch; `profile list` lists the available profiles. Malformed invocations return a `Usage:` message.

