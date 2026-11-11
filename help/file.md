### file

Read a text file from the workspace and print it as numbered lines in the current tab. A local tab reads from its workspace, or from the project directory when the tab has no workspace. Paths are relative to that root. The output carries no host tag.

**Usage**

`file read <path> [--offset <line>] [--limit <lines>]`

`--offset` is the first line to print and defaults to 1. `--limit` is the number of lines to print and defaults to 2000. One read prints at most 2000 lines, and files over 5 MB are refused.

**Output**

Each line is printed with its line number. A line longer than 2000 characters, counted in code points, is cut and ends with `…`. An empty file prints `(empty file)`. When lines remain after the last one printed, the read ends with a notice such as `(showing lines 1-2000 of 3500; continue with --offset 2001)`; run the same command with that offset to read the next part.

**Errors**

Each failure prints one line that names the path as you typed it:

- `File not found: <path>.`
- `Is a directory: <path>.`
- `Not a text file: <path>.` for binary content or text that is not valid UTF-8
- `File too large (>5 MB): <path>.`
- `Outside the workspace: <path>.` for an absolute path, a path that leaves the root, or a symbolic link that points outside it
- `Secret file: <path>.` for `.env` and `.env.*` files anywhere in the workspace, and for credential locations such as `.ssh`, `.aws`, `.gnupg`, `.kube`, `.netrc`, `.docker`, `.config/gh/hosts.yml`, and shell history files
- `Offset past end of file (<total> lines): <path>.` when `--offset` is beyond the last line; a one-line file prints `(1 lines)`

Bare `file`, `file read` without a path, an unknown subcommand, an unknown flag, a repeated flag, an `--offset` or `--limit` that is not a positive whole number, and a `--limit` above 2000 all print the usage line `Usage: file read <path> [--offset <line>] [--limit <lines>]`.

**Use cases**

- Look at a file's contents without opening an editor tab.
- Page through a long file 2000 lines at a time.
- Print a specific range of lines, such as the area around an error.

**Examples**

- `file read README.md` prints the first 2000 lines of `README.md`.
- `file read src/index.ts --offset 40 --limit 20` prints lines 40 to 59 of `src/index.ts`.
- `file read docs/guide.md --offset 2001` continues a long file after its first 2000 lines.
