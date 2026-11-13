### file

Read a text file from the workspace and print it as numbered lines in the current tab, or write or edit a text file there. A local tab reads from its workspace, or from the project directory when the tab has no workspace. Paths are relative to that root. A remote tab reads from its remote workspace clone on the remote machine, never from the local disk, with paths relative to that workspace. The output carries no host tag.

**Usage**

`file read <path> [--offset <line>] [--limit <lines>]`

`file write <JSON>`

`file edit <JSON>`

`--offset` is the first line to print and defaults to 1. `--limit` is the number of lines to print and defaults to 2000. One read prints at most 2000 lines, and files over 5 MB are refused.

**Output**

Each line is printed with its line number. A line longer than 2000 characters, counted in code points, is cut and ends with `…`. An empty file prints `(empty file)`. When lines remain after the last one printed, the read ends with a notice such as `(showing lines 1-2000 of 3500; continue with --offset 2001)`; run the same command with that offset to read the next part.

**Errors**

Each failure prints one line that names the path as you typed it:

- `File not found: <path>.` for a missing path, and also for a file that exists but cannot be read, such as one without read permission
- `Is a directory: <path>.`
- `Not a text file: <path>.` for binary content, text that is not valid UTF-8, or anything that is not a regular file or directory, such as a named pipe, socket, or device
- `File too large (>5 MB): <path>.`
- `Outside the workspace: <path>.` for an absolute path, a path that leaves the root, or a symbolic link that points outside it
- `Secret file: <path>.` for `.env` and `.env.*` files anywhere in the workspace, for credential locations such as `.ssh`, `.aws`, `.gnupg`, `.kube`, `.netrc`, `.docker`, `.config/gh/hosts.yml`, and shell history files, and for those locations under your home directory even when the tab's workspace is that directory or inside it
- `Offset past end of file (<total> lines): <path>.` when `--offset` is beyond the last line; a one-line file prints `(1 lines)`

On a remote tab, `Remote connection unavailable.` is printed when the tab has no live connection or its workspace is still being prepared. A connection that drops or stops answering mid-read prints `The remote connection ended.` or `The remote machine did not answer in time.`.

Bare `file`, `file read` without a path, an unknown subcommand, a second path argument, a path that starts with `--`, an unknown flag, a repeated flag, an `--offset` or `--limit` that is not a positive whole number, and a `--limit` above 2000 all print the usage line `Usage: file read <path> [--offset <line>] [--limit <lines>]`. The path is a single token with no whitespace, so a path containing spaces is read as two path arguments and cannot be read with this command.

**Use cases**

- Look at a file's contents without opening an editor tab.
- Page through a long file 2000 lines at a time.
- Print a specific range of lines, such as the area around an error.

**Examples**

- `file read README.md` prints the first 2000 lines of `README.md`.
- `file read src/index.ts --offset 40 --limit 20` prints lines 40 to 59 of `src/index.ts`.
- `file read docs/guide.md --offset 2001` continues a long file after its first 2000 lines.

**Writing and editing**

`file write <JSON>` creates or overwrites a text file. The JSON object takes `path`, `content`, and an optional `expectedHash`; when the hash is given and the file changed since then, the write is refused. The hash is the editor's internal content fingerprint, which `file read` does not print, so typed writes normally leave it out; a write without it simply creates or overwrites the file. Missing parent folders are created.

`file edit <JSON>` replaces exact text in an existing text file. The JSON object takes `path`, `oldString`, `newString`, and an optional `replaceAll`. The `oldString` must match exactly once unless `replaceAll` is `true`, which replaces every match.

Both use the same root as `file read`: the tab's workspace, or the project directory when the tab has none. A remote tab writes only in its remote workspace on the remote machine, never on the local disk. Paths are relative to that root. Because the path is a JSON string, it may contain spaces. Write newlines inside `content` as `\n`. Files and arguments are limited to 5 MB, and only UTF-8 text is written. Each command prints one line, and file content never appears in it:

- `Wrote <path>.`
- `Edited <path> (<count> replacements).`

Failures print one line naming the path, with control characters and bidirectional formatting controls escaped:

- `Outside the workspace: <path>.`, `Secret file: <path>.`, `File not found: <path>.`, `Is a directory: <path>.`, `Not a text file: <path>.`, and `File too large (>5 MB): <path>.`, with the same rules as `file read`
- `Is a directory: <path>.` also when the path ends in a path separator, such as `notes/`, checked before anything is written, on local and remote tabs alike
- `Protected file: <path>.` for any path inside a `.janissary` or `.git` folder, in any letter case and also when reached through a symbolic link. These folders hold the role grants and command settings that decide what an agent may run, and git hooks and settings that git later runs on its own, so neither command changes them and no missing folder is created inside them. `file read` can still read these files.
- `Not a text file: <path>.` also when `content` or `newString` contains an unpaired surrogate escape such as `\ud800`, checked before anything is written, on local and remote tabs alike
- `No matching text: <path>.` when `oldString` is not found, or contains an unpaired surrogate escape
- `Multiple matches: <path>; set replaceAll to true.` when `oldString` matches more than once
- `This file changed on disk since it was loaded: <path>.` when `expectedHash` no longer matches
- `<reason>: <path>.` for any other filesystem or remote failure, such as a permission error or an invalid remote reply
- On a remote tab, `Remote connection unavailable.`, `The remote connection ended.`, or `The remote machine did not answer in time.`

Missing or invalid JSON, a missing required field, an empty `path` or `oldString`, a field of the wrong type, or an unknown field prints `Usage: file write <JSON>` or `Usage: file edit <JSON>`.

- `file write {"path":"notes/todo list.md","content":"first\nsecond\n"}` writes a two-line file, creating `notes/` if needed.
- `file edit {"path":"notes/todo list.md","oldString":"second","newString":"done"}` prints `Edited notes/todo list.md (1 replacements).`.
- `file edit {"path":"src/a.ts","oldString":"foo","newString":"bar","replaceAll":true}` replaces every `foo`.
