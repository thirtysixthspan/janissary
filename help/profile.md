### profile

Launch a profile or list the available profiles.

**Usage**

`profile launch [<name>]`

`profile list`

**Use cases**

- Run a profile's runscript, `profiles/<name>.rs`, to set up tabs and settings.

**Examples**

- `profile launch review` launches the profile named `review`.
- `profile list` prints the available profiles in the transcript, one name per line, project profiles first and then built-in ones, or `No profiles.` when there are none.

Bare `profile launch` opens a picker of the available profiles. `profile` alone, or with any other subcommand, prints `Usage: profile launch <name> | profile list`. A name with no profile prints `No profile named "<name>".`

**Notes**

- An empty runscript, a `.rs` file with no commands, queues nothing and prints nothing.
- If a `.rs` file is removed after the app finds the profile but before it reads the file, the launch reports `No profile named "<name>".`
- Typed in a shell's command bar, `profile list` comes back as a reply below the command rather than being passed on to the shell.
