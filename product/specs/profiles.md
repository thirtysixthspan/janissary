## Profiles

A profile is a reusable, named set of AI harnesses and the tabs that support them for a particular use case (writing code, surfing the web, authoring a book, a specific task). Profiles are managed by `src/profiles.ts` and the `profile` command (`src/commands/profile.ts`).

### Storage

Project profiles live in a top-level `profiles/` directory (its path is set by `initProfileDir` in `src/profiles.ts`), kept separate from `.janissary/` so they are committable and are **not** cleared on launch. Janissary never creates it; a project author adds it by hand. Janissary also ships built-in profiles in its own `profiles/` directory. Profile reads search the project first and then the Janissary installation, so a project file with the same name overrides the built-in file. Each profile is a runscript named in dasherized text, `<name>.rs` (e.g. `writing-code.rs`). `resolveProfile` in `src/profiles.ts` makes that choice. Any other file in a `profiles/` directory, such as a `<name>.json`, is not a profile: it is never listed and never read.

### Runscript profiles

A profile is a runscript in the same format as a project runscript (see [[scheduling]]): one command per line, with blank lines and `#` comment lines dropped. `profile launch <name>` runs it. The runscript is run by `launchProfileRunscript` in `src/profile/runscript.ts`.

Its lines are queued to the managed system shell in one batch, exactly as `execute <name>` queues a project runscript, so they share that shell's FIFO with scheduled and manual runs and can be shell commands or Janissary commands. On success nothing is printed, matching `execute`. An empty runscript queues nothing and prints nothing. If the system shell cannot start, it reports its own failure and the launch adds nothing.

Any entry at `<name>.rs` claims the name, including a symlink, so a project symlink still overrides a built-in profile of the same name. The runscript reader refuses a symlink or other non-regular file, as it does for project runscripts, and the launch reports `Could not read runscript for profile "<name>".`. A runscript removed between being found and being read reports `No profile named "<name>".`.

A runscript line `profile launch <name>` naming its own profile runs the same runscript again; nothing detects that loop.

### `profile launch <name>`

Typing bare `profile launch` (no name) opens a picker listing profiles from the project and the Janissary installation in two labeled sections, Project first and Janissary second. Each section lists the profile names of that source alphabetically, one row per `.rs` runscript; a subdirectory inside a `profiles/` directory is never listed, so the picker is a flat list of launchable profiles with no directory rows to expand. A same-named built-in profile is omitted when the project supplies an override, and an empty source's section is omitted. The profile list travels with the app's state updates and, like the task list (see [[task-picker]]), the server re-reads the two profile directories at most once per second, so a profile file created on disk can take up to about a second to appear in the picker. Mirroring the `tasks` picker's interaction, arrow keys move the selection while skipping section headers, Enter or a click populates the command line with `profile launch <name>` without submitting it (so it can be reviewed or edited first), and Escape closes it. When a profile is added or removed while the picker is open, the selection is kept on a real profile row exactly as the task picker keeps its own (see [[task-picker]]): it moves off a section header or back inside a shorter list by position, a key pressed before that correction renders only re-seats it without picking, and Escape always closes.

The command is placed in the bar that opened the picker, including a docked shell's own bar, and is never submitted by the selection. If that tab closes while the picker is open, selection does not insert the command into another tab. On a harness tab, selection sends the command directly to that harness's PTY.

With a name, `profile launch <name>` runs the named profile's runscript (see Runscript profiles). A missing profile returns `No profile named "<name>".`.

### `profile list`

Lists the available project profiles followed by built-in Janissary profiles (each `profiles/*.rs` file with its extension stripped, each source sorted), or `No profiles.` when neither source has any. A project profile hides a same-named built-in profile.

From a shell command bar, the list is returned as the `profile list` reply below the command rather than being sent to zsh.

### `profile` command

`profile` launches a set of harnesses and the tabs that support them, described in a profile runscript. See the Profiles section. `profile launch <name>` runs the named profile's runscript; `profile list` lists the available profiles. Malformed invocations, including an unrecognized subcommand, return `Usage: profile launch <name> | profile list`.
If an asynchronous launch fails, its issuing transcript receives one
`Profile command failed: <reason>.` result instead of leaving the command unfinished.
