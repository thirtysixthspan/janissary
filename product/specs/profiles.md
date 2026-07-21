## Profiles

A profile is a reusable, named set of agents and/or AI harnesses for a particular use case (writing code, surfing the web, authoring a book, a specific task). Profiles are managed by `src/profiles.ts` and the `profile` command (`src/commands/profile.ts`).

### Storage

Profiles live in a top-level `profiles/` directory (`initProfileDir` in `src/cli.tsx`), kept separate from `.janissary/` so they are committable and are **not** cleared on launch. Each profile is a single JSON file named in dasherized text (e.g. `writing-code.json`). Its root object has an `agents` array and a `harnesses` array of entries, plus plain profile-level config keys (`monitors`, `files`, `notifications`, `schedules`, `layout`). Membership in the `agents` vs `harnesses` array is the discriminator — an agent entry versus a harness entry — and each entry carries its own `name` field supplying its tab label. An unrecognized top-level key is ignored, reserving that namespace for future config.

An agent entry uses the agent-state schema — the same format as `.janissary/state/<name>.json` — with a required `name` and the tab presentation (dot color, order, group, group color) grouped under a `tab` object (see below). A harness entry names which binary to launch with a **`type`** field (`claude`, `opencode`, or `codex`) and supports:

- **model** — passed to the harness binary's `--model` flag, verbatim. Validated at launch against the known model catalog for that harness; an unknown model is reported (`Unknown model "<model>" for harness "<type>" — add it to harness-models.json.`) and the entry is skipped, same as an unknown harness type.
- **effort** — the effort level, verbatim, like `harness <name> --effort <level>`. Not validated against any fixed set of levels, and translated to whichever flag the target harness understands (claude `--effort`, codex `-c model_reasoning_effort=<level>`, opencode has none and drops it).
- **workspace** — launch in a fresh workspace clone (default false), like `harness <name> --workspace`.
- **autoApprove** — auto-approve the harness's own permission prompts, like `harness <name> -y/--yes`. Claude-only; an entry that sets it for a non-claude harness is reported and skipped, same as an unknown harness or model. Works with or without `workspace`, but without it, the launched tab's terminal shows a security warning since prompts are then approved unattended with no sandbox.
- **offline** — add a network-deny rule to the tab's sandbox profile, like `harness <name> --offline` (only meaningful alongside `workspace`).
- **cwd** — starting directory (default: the issuing tab's cwd), expanded the same way the `files` command's path argument is — `$root` resolves to the launch directory and `~` to home, so a hand-authored or saved `cwd` can be written portably instead of as a literal absolute path.
- **run** — a list of commands typed into the harness once, shortly after launch (each becomes a one-shot schedule entry that fires on the first scheduler tick and then disappears from the schedule panel).
- **schedule** — a list of authored schedule lines in the `schedule` command grammar, minus the `in <tab>` clause (the tab is implicitly this entry's own tab). A line that fails to parse, or that includes an `in <tab>` clause, is reported in the launch output and skipped; a duplicate schedule name within one entry keeps the first and reports the rest.

Both kinds of entry group their tab presentation under a **`tab`** object: `color` (the dot color), `number` (tab order, mirroring `--relaunch` restoration; entries are opened in `number` order), `group` (an explicit group number for the whole profile — see Tab grouping below), and `groupColor`. These map to the tab's flat runtime fields.

A harness entry's schedule and one-shot `run` commands are **memory-only**: harness tabs have no persisted agent state, so closing the tab, quitting the app, or the harness process exiting ends the loop, and `--relaunch` does not restore it (see Harness Tab § Lifecycle). Re-running `profile launch <name>` recreates the whole setup from the profile file, which remains the single source of truth.

A harness entry's `run`/`schedule` commands are typed into the harness's own terminal, so they must be things that harness understands — not janissary commands. To start a janissary-level construct like a monitor as part of a profile, use the profile-level `monitors` key below.

### Malformed profiles

A profile file is validated once, in full, before any tab is opened. If the file is not valid JSON, its root is not an object, any element of `agents`/`harnesses` is not a structurally valid entry (e.g. an agent lacking a string `name`, or a harness lacking a string `type`), or any config section has the wrong shape, `profile launch` reports `Profile "<name>" is malformed.` (suggesting `profile validate <name>` for detail) and opens **nothing** — no partial launch.

This structural check is distinct from the semantic launch-time checks. "Malformed" means the file's *shape* is wrong. The launcher's per-entry semantic checks are unchanged: an unknown harness type, an unknown model, `autoApprove` on a non-claude harness, and unparseable `schedule`/`run` lines are each reported and that one entry skipped while the rest launch. A structurally valid file naming an unknown model is not malformed — it launches, skipping that entry.

### Profile-level monitors

A profile may declare monitors under a `monitors` key — a JSON array of `{ name, persona, targets }` objects, where `targets` is a list of authored target words in the `monitor` command grammar (`group:<n>` or a tab label; an empty list is inline mode). Each monitor's `name` is its runtime identity, distinct from its persona: two monitors may share a persona yet coexist under different names, and a relaunch refreshes the one whose owner and name match. `name` may be omitted, in which case it defaults to the persona. Once every profile entry is open, each monitor is started from the tab `profile launch` was issued from as `monitor <persona> <targets…>`, so its targets resolve against the complete tab list (including the just-opened entries). Being owned by the issuing tab rather than by a profile entry, a monitor keeps running when the profile's own tabs are closed; it stops when the issuing tab closes or via `unmonitor` from that tab.

Starting is **idempotent across relaunch**: before starting each monitor, any existing monitor with the same owner and name is stopped, so re-running `profile launch <name>` refreshes the monitors rather than reporting `Already monitoring`. Each monitor's outcome — started (with its resolved targets) or the parse/validation error that skipped it — is included in the launch report.

### Profile-level file navigator

A profile may declare one or more file-tree tabs to open under a `files` key — a JSON array of `{ dock?, in?, path? }` objects: `dock` docks the tree into that sidebar (`left`/`right`); `in` roots it at the cwd of the named tab instead of the default; `path` roots it at a literal path, expanded the same way the `files` command's path argument is — so `$root` roots the tree at the launch directory regardless of which tab the profile opened. Once every profile entry is open, each is opened as `files [in <in>] [on <dock>] [<path>]`, with `in` defaulting to the profile's first newly opened tab when omitted — so an entry with no `in` and no `path` shows that tab's own workspace, while an absolute `path` such as `$root` is independent of that tab. Because a docked tree is never the active tab, opening and docking one of these can move focus away from the first newly opened tab to the nearest non-docked tab — the same invariant `files left`/`files right` already has outside of profiles.

### Profile-level notifications tab

A profile may declare that the notifications tab should open on launch under a `notifications` key — a JSON array of `{ dock?, focus? }` objects, where `dock` docks the feed into that sidebar (`left`/`right`) and `focus` (only meaningful alongside `dock`) makes the notifications tab the visible one in that sidebar's internal tab-switcher, overriding the default "most recently docked tab wins" behavior — useful when a file tree or the schedules tab is also docked to the same side. Once every profile entry is open, each entry opens or docks the singleton notifications tab, mirroring the `notifications [left|right]` command. Because the notifications tab is a singleton, more than one entry simply re-docks the same feed.

### Profile-level schedules tab

A profile may declare that the schedules tab should open on launch under a `schedules` key — a JSON array of `{ dock? }` objects, where `dock` docks the list into that sidebar (`left`/`right`). Once every profile entry is open, each entry opens or docks the singleton schedules tab, mirroring the `schedules [left|right]` command. Because the schedules tab is a singleton, more than one entry simply re-docks the same list.

### Profile-level layout

A profile may declare the size of the application window, the left/right sidebars, and the split between the upper action-tab area and the lower reporting-tab area under a `layout` key. Its value is the layout object directly: `{ "sidebar": { "left": 320, "right": 280 }, "tabAreaPct": 75, "window": { "width": 1440, "height": 900 } }`. The left/right sidebar widths are grouped into a `sidebar` object parallel to `window`; `window.width`/`window.height` are pixels; `sidebar.left`/`sidebar.right` are pixels; `tabAreaPct` is 0-100 and is the upper action area's share of the vertical split.

The layout is applied once every entry is open, on **every** `profile launch`, including a relaunch — it always overrides whatever the user had manually resized things to. Any dimension the `layout` key doesn't mention resets to the app's built-in default (1280x800 window, 300px sidebars, the reporting section's current default height percentage) rather than being left at whatever it currently is. Sizes are applied exactly as specified, even if they exceed the manual-drag limits on sidebars or the reporting split, or the screen's own bounds — a profile's numbers are trusted as authoritative. (A malformed `layout` field makes the whole profile malformed — see Malformed profiles above.)

When the server was started with `--no-open` (no application window opened), the window-size portion of `layout` is ignored entirely — no resize attempt and no report note — while the sidebar/tab-area sizes still apply to any connected browser client.

### `profile launch <name>`

Typing bare `profile launch` (no name) opens a picker listing the available profiles,
mirroring the `tasks` picker's interaction: arrow keys move the selection, Enter or a
click populates the command line with `profile launch <name>` without submitting it (so
it can be reviewed or edited first), and Escape closes it.

Opens a tab for each entry in the named profile, in `number` order. For an agent entry, its state is written into the live state dir and the agent is initialized (`initAgentState`) and restored into a new tab — recovering its command history, transcript, working directory, schedule, and dot color (the entry's `tab.color` is used when it is distinct enough from the colors already on screen, otherwise the most distinct palette color is chosen). For a harness entry, a harness tab is opened directly (see Harness Tab) with the entry's model, starting directory, and workspace flag; it is never persisted to agent state. Once every entry is opened, focus moves to the first newly opened tab. A missing profile returns `No profile named "<name>".`, a malformed one returns `Profile "<name>" is malformed.`, and an empty one returns `Profile "<name>" has no agents.`.

**Relaunching.** A profile may be launched more than once. Before opening any entry, every currently open tab whose label matches an entry in the profile is closed first (killing its PTYs/shells, dropping its schedule, and removing its workspace clone), and then every entry opens fresh — so a relaunch always gets a new process, a schedule re-based to "now", and a new workspace clone where applicable. The one exception is the tab `profile launch` was issued from: it is never closed, and if the profile names an entry matching its label, that entry is reported and skipped instead, so the launch report always has a tab to land in.

All of a launched profile's entries are placed into a single **new group** (the next free group number, or a group number authored on any of the profile's entries — agent or harness), kept contiguous in the tab strip. The group's bar color is fixed to the first opened entry's color and shared by the rest, so a profile's tabs read as one band distinct from the root group and from other profiles. See Tab grouping.

### `profile list`

Lists the available profile names (each `profiles/*.json` file with its extension stripped, sorted), or `No profiles.` when none exist.

### `profile validate [<name>]`

Checks a profile file against the schema and reports the specific problems it finds, so an author of a hand-written file can catch a mistake without launching it. `profile validate <name>` reports `Profile "<name>" is valid.` or a list of the specific problems, each naming the offending key or field with location context (e.g. `harnesses[0]: type must be a string`, `layout.window: width must be a number`). Bare `profile validate` (no name) validates every profile and reports each one's status.

Validation checks **structure only** — the same all-or-nothing shape check the launcher runs, but collecting every problem instead of failing on the first. It does not perform the semantic launch-time checks (unknown harness/model, `autoApprove` on a non-claude harness, schedule/run parseability), which depend on runtime catalogs and remain the launcher's job. A name with no matching profile reports `No profile named "<name>".`; unparseable JSON reports a single `not valid JSON`.

### `profile save <name>`

Captures the running session into a single `profiles/<name>.json` — the inverse of `profile launch`. `<name>` is used verbatim as the filename, with no dasherization. Every open tab is captured, including the tab the command was typed in (unlike `profile launch`, which never touches its own issuing tab) — except the root `janus` tab that every session opens automatically on startup, which is left out of the capture entirely since relaunching a profile always has its own fresh session, and so its own fresh root tab, to land in.

Each agent tab is written as a clean, reusable template into the `agents` array: its name, and a `tab` object with its dot color, tab order, group, and group color, plus its starting directory. Command history, transcript, and any queued commands are deliberately left out, so a saved profile is a fresh starting point rather than a frozen session — reopening it later starts each agent from scratch. Each harness tab is written into the `harnesses` array the same way: harness type, model, effort level, workspace/offline/auto-approve flags, the `tab` presentation object, and starting directory. A harness tab's scheduled or one-shot commands are never captured, since they exist only in memory and are not recoverable.

A starting directory under the project root is captured relative to it (`$root/...`) rather than as an absolute path, so a saved profile stays portable across machines and checkouts; one elsewhere is captured as-is.

Live group and dot-color assignments are captured exactly as they appear on screen. Note that `profile launch` always places a profile's entries into one new group regardless of what each entry's own `group` says (see Relaunching below), so a session with agents split across several groups does not round-trip that split — launching the saved profile merges them back into a single group.

The window size, sidebar widths, and the split between the tab area and the reporting area are captured into the profile's layout, matching whatever the window and sidebars currently look like. When the server was started with `--no-open` (no application window), the window-size portion is skipped — the sidebar/tab-area sizes are still captured — and the command's output notes that the window size wasn't captured.

Any running monitors are captured too, into the `monitors` key by name, persona, and their monitored tabs/groups; an inline monitor (one with no separate reporting tab) is captured the same way. A monitor started without an explicit name (from the interactive `monitor` command) is captured with its name defaulting to its persona. A docked file navigator, notifications tab, or schedules tab is captured by which sidebar it's docked to; a file navigator's tree root is captured as a literal path. Which docked tab is currently visible in a sidebar's internal tab-switcher is not captured, and neither is a file navigator's association with the tab it was opened from — reopening the saved profile roots each captured file navigator directly at the path it was saved with.

Tabs with no equivalent in a profile — an opened image, a web page, a markdown viewer, a text editor, an ssh connection, a monitor's own reporting tab, or a file navigator that isn't docked into a sidebar — are left out of the saved profile and listed by name in the command's output, so it's clear what wasn't captured.

Saving over an existing profile name replaces it outright: the single file is rewritten from the current session, with no confirmation prompt (and a stale same-named directory left over from the old multi-file format is removed). On success, the command reports what was captured — counts of agents, harnesses, the layout, monitors, and docked tabs — followed by the list of any tabs that were skipped.

### `profile` command

`profile` launches a saved set of agents and harnesses. See the Profiles section. `profile launch <name>` opens a tab for each entry in the named profile (restoring agent state, or launching a harness), closing and reopening any tab that collides with a relaunch; `profile list` lists the available profiles; `profile save <name>` captures the running session into a new or overwritten profile; `profile validate [<name>]` checks one or every profile file against the schema. Malformed invocations return a `Usage:` message.

