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
