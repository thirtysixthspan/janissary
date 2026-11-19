### file

Read a text file from the workspace and print it as numbered lines in the current tab, find files there by path, search those files for text, write or edit a text file there, or apply a patch that changes several files. It also lists a directory with `file list` (alias `file ls`), prints one entry's details with `file stat`, checks a path with `file exists`, and prints the first or last lines with `file head` and `file tail`. A local tab reads from its workspace, or from the project directory when the tab has no workspace. Paths are relative to that root. A remote tab reads from its remote workspace clone on the remote machine, never from the local disk, with paths relative to that workspace. The output carries no host tag.

**Usage**

`file read <path> [--offset <line>] [--limit <lines>]`

`file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`

`file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>`

`file write <JSON>`

`file edit <JSON>`

`file patch <JSON>`

`file list <path>`

`file ls <path>`

`file stat <path>`

`file exists <path>`

`file head <path> [-n <lines>]`

`file tail <path> [-n <lines>]`

For `file read`, `--offset` is the first line to print and defaults to 1, and `--limit` is the number of lines to print and defaults to 2000. One read prints at most 2000 lines, and files over 5 MB are refused. The **Output** and **Errors** notes below cover `file read` too. `file glob` has its own flags and defaults under **Finding files**. `file grep` has its own flags and defaults under **Searching contents**. `file write` and `file edit` are under **Writing and editing**. `file patch` is under **Patching several files**. `file list`, `file ls`, `file stat`, `file exists`, `file head`, and `file tail` are under **Listing and inspecting paths**.

**Output**

`file read` prints each line with its line number. A line longer than 2000 characters, counted in code points, is cut and ends with `…`. An empty file prints `(empty file)`. When lines remain after the last one printed, the read ends with a notice such as `(showing lines 1-2000 of 3500; continue with --offset 2001)`; run the same command with that offset to read the next part.

**Errors**

Each `file read` failure prints one line that names the path as you typed it:

- `File not found: <path>.` for a missing path, a dangling link, or a path whose parent is a regular file
- `Permission denied; check file and folder permissions, then try again: <path>.` for a file that exists but cannot be read, such as one without read permission
- `Filesystem error <code>; check the item and destination, then try again: <path>.` for any other read failure, such as a symlink loop (`ELOOP`); a code with its own mapping prints that reason instead
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

**Finding files**

`file glob <pattern>` lists the paths that match a pattern, one per line. It prints paths only, never file contents. It uses the same root as `file read`: the tab's workspace, or the project directory when the tab has none. A remote tab searches only its remote workspace on the remote machine, never the local disk.

- `file glob **/*.ts` lists every TypeScript file in the workspace.
- `file glob *.md --path product --limit 20` lists up to 20 Markdown files directly inside `product/`.
- `file glob * --dirs --path src` lists the folders directly inside `src/`.

The pattern is one token with no whitespace, and matching is case-sensitive. `**` matches any number of folders, `*` matches any characters within one name, `?` matches one character, and `{a,b}` matches either `a` or `b`. The pattern is matched against paths relative to `--path`, which defaults to the root. A pattern without a slash matches only names directly inside that folder, so `file glob *.ts --path src` lists `src/a.ts` but not `src/x/b.ts`; use `**/*.ts` to search below it. Other pattern syntax, such as `+(a|b)`, is matched literally. A backslash is read as `/`, so it separates folders and is never an escape: `a\*.ts` searches inside a folder `a`. A literal `*`, `?`, `{`, or `[` in a name is matched with a bracket class such as `[*]`, so `a[*].ts` finds a file named `a*.ts`.

Each result is a path relative to the root, written with forward slashes, so you can pass it straight to `file read`. Results come depth-first, by name within each folder, so `a/b.ts` comes before `a.ts`.

By default, names that start with a dot, `node_modules` folders, and paths git ignores are skipped. `--hidden` includes them, and wildcards then match names that start with a dot too, so `file glob **/*.yml --hidden` finds `.github/workflows/ci.yml`. The `--path` folder itself is never skipped, so `file glob **/*.yml --path .github` finds it without `--hidden`. The `.git` folder is never listed. Outside a git repository, nothing counts as git-ignored. Secret files are always left out, even with `--hidden`: `.env` and every `.env.*` file, and credential locations such as `.ssh`, `.aws`, `.gnupg`, `.kube`, `.netrc`, `.docker`, `.config/gh/hosts.yml`, and shell history files.

Symbolic links to folders are never entered or listed. A symbolic link to a file is listed unless its target is a secret file, lies outside the workspace, or can't be found.

`--dirs` lists folders instead of files, each ending in `/`. Empty folders are included, and the `--path` folder itself is not.

`--limit` sets how many paths to print, from 1 to 1000, and defaults to 100. When more paths match, the list ends with `(showing the first <n> matches; narrow the pattern or raise --limit)`. When nothing matches, it prints `(no matches)`. A search that runs for 30 seconds stops and ends with `(search stopped after 30 seconds; narrow the pattern or --path)`; when the limit ends the search first, only the limit line is printed.

A bad `--path` prints one line naming it as you typed it:

- `Outside the workspace: <dir>.` for an absolute path, a path that leaves the root, or a symbolic link that points outside it
- `Directory not found: <dir>.`
- `Not a directory: <dir>.`, which is also what a secret file such as `.env` prints

A `--path` naming a secret folder, such as `.aws`, prints `(no matches)`.

On a remote tab, `Remote connection unavailable.` is printed when the tab has no live connection or its workspace is still being prepared. A connection that drops or stops answering mid-search prints `The remote connection ended.` or `The remote machine did not answer in time.`.

A missing pattern, a second pattern, an unknown or repeated flag, a `--path` with no value or followed by another flag, and a `--limit` that is not a positive whole number or is above 1000 all print the usage line `Usage: file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]`. A pattern longer than 1024 characters, whose `{a,b}` choices combine into more than 64 patterns, with more than three `*` wildcards in one name, or with three in one name when its `{a,b}` choices make more than two patterns is refused with `Pattern too complex: use at most 1024 characters, 64 {a,b} combinations, and three * wildcards in one name, or two when {a,b} choices make more than two patterns.`, because matching it could take minutes. So `*-*-*.{ts,js}` is allowed but `*-*-*.{ts,js,md}` is not. A `**` folder wildcard does not count as a `*`. A pattern with a `..` folder in it, in any of its `{a,b}` choices and with `\` read as `/`, is refused with `Pattern cannot contain a .. folder: file glob only lists paths inside --path.`, because every result lies inside `--path`. Names that only contain dots, such as `..a` or `.env`, are allowed.

**Searching contents**

`file grep <pattern>` prints one line per matching line, `<path>:<line>: <preview>`, such as `src/file-read/command.ts:9: export const FILE_READ_USAGE = …`. It searches the same root as `file read`: the tab's workspace, or the project directory when the tab has none. A remote tab searches only its remote workspace on the remote machine, never the local disk.

Flags come first, in any order, and each may appear once. The first token that is not one of these flags starts the pattern, and the rest of the line, including internal spaces, is the pattern. A `--` ends the flags, so `file grep --literal -- --limit` searches for `--limit`. Without `--`, an unknown flag before the pattern prints the usage line. Flag values are single tokens with no whitespace.

- `--literal` matches the pattern as fixed text, so regular-expression punctuation searches for itself.
- `--word` requires the match to sit on a word boundary.
- `--case-sensitive` turns on case sensitivity; matching is case-insensitive by default.
- `--path <path>` searches only that folder, or that single file. `.`, `./src`, and `src/` are accepted.
- `--include <globs>` and `--exclude <globs>` filter by comma-separated globs such as `*.ts,*.tsx`. A glob without a slash matches a name at any depth; one with a slash is anchored to `--path`. A plain name selects a whole folder, exclude wins over include, and the comma always separates patterns, so write `*.js,*.jsx` rather than `*.{js,jsx}`.
- `--limit <n>` prints at most `n` rows, from 1 to 250, and defaults to 100.

The pattern is a JavaScript regular expression, matched one line at a time: `^` and `$` anchor to that line, and no pattern spans two lines. A malformed pattern prints the engine's message plus `Use --literal to search for the text as typed.`. A pattern that can match empty text prints `Pattern matches empty text, so it would match every line: <pattern>.` and searches nothing.

Output paths are root-relative with forward slashes, even when `--path` narrows the search, so a path can go straight to `file read`. Rows come in path order, then line order. The preview trims leading whitespace, shows a window of 200 UTF-16 code units around the first match with `…` at a cut end, and drops a trailing carriage return. Lines are split on a newline only, so a `$` pattern does not match a line that ends in a carriage return. When nothing matches, the output is `(no matches)`.

When more lines match than the limit, the output ends with `(showing the first <n> matches; narrow the pattern or raise --limit)`. A search stops after 30 seconds and ends with `(search stopped after 30 seconds; narrow the pattern or --path)`. A pattern that takes too long on one file ends the search with `(search stopped: the pattern took too long on <path>; simplify it or use --literal)`. Only the ending that happens first is printed.

Searches use the same file set as Quick Open: tracked and untracked files git does not ignore, so a tracked dotfile such as `.github/workflows/ci.yml` is searched. Outside a git repository, every file is searched except those under `.git`, `.svn`, and `.hg` and the `.DS_Store` and `Thumbs.db` files, so `node_modules` is searched too. Files over 2 MB and binary files are skipped without a message. Secret files and symbolic links are skipped and never searched. There is no `--hidden` flag.

A bad `--path` prints one line naming it as you typed it: `Path not found: <path>.` when nothing exists there, and `Outside the workspace: <path>.` for an absolute path, a path that leaves the root, or a path whose real location is outside the root. A `--path` naming a single file is filtered like a directory search: when that file is git-ignored, secret, binary, over 2 MB, or excluded by `--include` or `--exclude`, the output is `(no matches)` with no reason. A symbolic link named as `--path` is skipped the same way when it is dangling or resolves inside the root, while one that resolves outside the root is refused as `Outside the workspace: <path>.`.

Malformed arguments print `Usage: file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>`. A missing pattern, an unknown flag before the pattern, a repeated flag, a flag with no value, and a `--limit` that is not a whole number from 1 to 250 all print it.

On a remote tab, `Remote connection unavailable.` is printed when the tab has no live connection or its workspace is still being prepared. A connection that drops or stops answering mid-search prints `The remote connection ended.` or `The remote machine did not answer in time.`.

- `file grep TODO` finds every line containing `TODO`.
- `file grep --literal --include *.md request timed out` searches Markdown files for that exact phrase.
- `file grep --path src --include commands/*.ts --limit 20 FILE_READ_USAGE` searches TypeScript files directly inside `src/commands/`.

**Writing and editing**

`file write <JSON>` creates or overwrites a text file. The JSON object takes `path`, `content`, and an optional `expectedHash`; when the hash is given and the file changed since then, the write is refused. The hash is the editor's internal content fingerprint, which `file read` does not print, so typed writes normally leave it out; a write without it simply creates or overwrites the file. Missing parent folders are created.

`file edit <JSON>` replaces exact text in an existing text file. The JSON object takes `path`, `oldString`, `newString`, and an optional `replaceAll`. The `oldString` must match exactly once unless `replaceAll` is `true`, which replaces every match.

Both use the same root as `file read`: the tab's workspace, or the project directory when the tab has none. A remote tab writes only in its remote workspace on the remote machine, never on the local disk. Paths are relative to that root. Because the path is a JSON string, it may contain spaces. Write newlines inside `content` as `\n`. Files and arguments are limited to 5 MB, and only UTF-8 text is written. Each command prints one line, and file content never appears in it:

- `Wrote <path>.`
- `Edited <path> (<count> replacements).`

Failures print one line naming the path, with control characters and bidirectional formatting controls escaped:

- `Outside the workspace: <path>.`, `Secret file: <path>.`, `File not found: <path>.`, `Is a directory: <path>.`, `Not a text file: <path>.`, and `File too large (>5 MB): <path>.`, with the same rules as `file read`
- `Is a directory: <path>.` also when the path ends in a path separator, such as `notes/`, or its last segment is `.` or `..`, such as `notes/.`, checked before anything is written, on local and remote tabs alike
- `Protected file: <path>.` for any path inside a `.janissary` or `.git` folder, in any letter case, including case-folding and compatibility spellings such as a long `ſ` in place of `s`, and also when reached through a symbolic link. These folders hold the role grants and command settings that decide what an agent may run, and git hooks and settings that git later runs on its own, so neither command changes them and no missing folder is created inside them. `file read` can still read these files.
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

**Patching several files**

`file patch <JSON>` applies a patch that adds, deletes, updates, and moves several text files. The JSON object has exactly one key, `patchText`, a string. Keep it on one line and write the patch's newlines as `\n`. Any other key, a missing key, a non-string value, or bad JSON prints `Usage: file patch <JSON>`. An argument over 5 MB, counted in its UTF-8 bytes as typed, prints `Patch too large (>5 MB). No files were changed.`, while a malformed argument of that size prints the usage line.

It uses the same root as `file write`: the tab's workspace, or the project directory when the tab has none. A remote tab applies its patch only in the remote workspace on the remote machine, never on the local disk. Paths are relative to that root.

`*** Begin Patch` as the first line and `*** End Patch` as the last are optional. The markers are `*** Add File: <path>`, `*** Delete File: <path>`, `*** Update File: <path>`, and `*** Move to: <path>`, spelled exactly, in that case. The path after the colon is trimmed. A patch typed with CRLF line endings parses like one typed with LF.

`*** Add File: <path>` creates a file, and every content line starts with `+`; an Add with no content lines creates an empty file. The file is written with LF line endings and a final newline, with no byte-order mark, with default permissions, and missing parent folders are created. Adding a path that exists fails `File already exists`, unless an earlier section deleted it or moved it away, which is how a patch overwrites a file.

`*** Delete File: <path>` removes a file and takes no body lines. A missing path fails `File not found`. A symbolic link is removed, never its target. A folder left empty by the delete stays.

`*** Update File: <path>` changes a file through hunks. A hunk starts with `@@`, optionally `@@ <line>` to move the search to the next line equal to it; the first hunk may omit `@@`. Hunk lines start with a space for context, `-` for a removed line, or `+` for an added line. An empty context line is a single space, while a blank line is an error. `*** End of File` ends a hunk that must match at the end of the file.

Hunks are searched in order, each after the previous match, and the first match wins. A match is tried exactly first, then ignoring trailing whitespace. A hunk with only `+` lines inserts at the current search position. The file keeps its line ending, judged from its first line, its final-newline state, its byte-order mark, and its permissions, and an Update through a link inside the root changes the link's target. There is no `\ No newline at end of file` marker.

`*** Move to: <new>` directly after `*** Update File: <old>` renames the file, leaving a link a link, with optional hunks. The new path follows the same rule as an Add.

A patch applied through a root that is itself a symbolic link behaves as it does through the real directory: an Update through a link inside the root changes its target, a Delete removes the link, and a Move moves the link. A link whose target lies outside the root is still refused.

On a volume that ignores letter case, sections naming the same path the patch itself creates in different case act on one file, so a second Add of that path fails `File already exists` and an Update or Delete through either spelling changes that file. Differently cased spellings of one missing folder are one folder, created once under the first spelling. On a case-sensitive volume the spellings stay separate.

Sections apply in order, and a later section sees what earlier ones did, so one path may appear in several sections. Every section is checked against the in-memory view before anything is written, so a failed check changes nothing. If a disk write fails while applying the patch, the files already changed are put back, leaving nothing changed. Only a failed restore can leave some files changed, and the `Patch failed while applying` bullet below names which result you got.

A successful patch prints a header and one row per path in the order a section first names it:

- `Patched <n> files:`, or `Patched 1 file:`, or `Patched 0 files:` when the sections cancel out
- `A <path>` for an added path, `M <path>` for a modified path, `D <path>` for a deleted path, and `R <old> -> <new>` for a file that existed before the patch and was renamed to a path that did not exist before the patch, each path once with its net change

A move onto a path that existed before the patch, including one deleted or moved away earlier in the same patch, keeps that path's own net row instead of an `R`: it prints `M <destination>` when the path exists at the end or `D <destination>` when it does not, while the origin reports `D`. Deleting `b` and then moving `a` to `b`, for example, prints `M b` and `D a`.

Paths are as typed, with control characters escaped. File content never appears.

Failures print one line:

- `Malformed patch at line <n>: <problem>. No files were changed.`, where `<problem>` is one of `unknown marker "<line>"`, `missing path`, `no file sections`, `Add File lines must start with "+"`, `Move to must follow Update File`, `hunk lines must start with " ", "-", or "+"`, and `Update File needs a hunk or Move to`
- `Patch failed at section <k> (<marker>): <reason>. No files were changed.`, where `<k>` counts sections from 1 and `<marker>` is `Add File: <path>`, `Delete File: <path>`, or `Update File: <path>`; a Move section names its Update marker
- `Patch failed while applying: <reason>: <path>. No files were changed.` when a disk write fails and everything is put back, and the same with `Some files may have been changed.` when putting it back fails too
- On a remote tab, `Remote connection unavailable.`, `The remote connection ended.`, or `The remote machine did not answer in time.`, and `Patch failed: <reason>.` for any other remote failure, which makes no promise about the remote files

The `<reason>` in a section failure names either the patch rule that refused the section or the filesystem failure behind it. The reasons include `Outside the workspace`, `Protected file` for `.git` and `.janissary`, as for `file write`, `Secret file`, `Is a directory`, `Not a text file` for a dangling link, a link whose target an earlier section deleted, or a result holding NUL or an unpaired surrogate, `File too large (>5 MB)` for a file read or a result over 5 MB, `File not found`, `File already exists`, `No matching text for hunk starting "<line>"` naming the hunk's first context or `-` line, or its `@@` anchor text when the anchor is not found, and `Filesystem error ENOTDIR; check the item and destination, then try again` for a path under a file. Any other filesystem failure also appears as the reason, such as `Permission denied; check file and folder permissions, then try again` when a path cannot be read or written, or `The source or destination no longer exists; refresh the file navigator, then try again` when a path vanishes while the patch runs.

- `file patch {"patchText":"*** Begin Patch\n*** Add File: notes/new/todo.md\n+# Todo\n*** Update File: src/a.ts\n@@\n const a = 1;\n-const b = 2;\n+const b = 3;\n*** Update File: src/x.ts\n*** Move to: src/y.ts\n*** Delete File: old.txt\n*** End Patch"}` prints `Patched 4 files:` with `A notes/new/todo.md`, `M src/a.ts`, `R src/x.ts -> src/y.ts`, and `D old.txt` in that order.
- `file patch {"patchText":"*** Delete File: old.txt"}` prints `Patched 1 file:` and then `D old.txt`.
- `file patch {"patchText":"*** Add File: z.md\n+z\n*** Update File: src/a.ts\n@@\n const a = 1;\n-const b = 99;\n+const b = 4;"}` prints `Patch failed at section 2 (Update File: src/a.ts): No matching text for hunk starting "const a = 1;". No files were changed.` and leaves `z.md` out.

**Listing and inspecting paths**

`file list <path>` prints one row per entry of a directory. `file ls <path>` is the same command under a shorter name, but its usage errors print the `list` usage line. `file stat <path>` prints one row for a single path and works on both files and directories, so a directory target prints a `dir` row instead of being refused. All three use the same root as `file read`: the tab's workspace, or the project directory when the tab has none; a remote tab uses its remote workspace on the remote machine and never the local disk. Their output carries no host tag.

A row is fixed tokens separated by single spaces: a type word (`file` or `dir`), an `rwx` permission string starting with `-` for a file or `d` for a directory, the byte size, the modification time as an ISO UTC timestamp such as `2026-11-19T13:50:00Z`, and the entry name — for example `file -rw-r--r-- 1234 2026-11-19T13:50:00Z notes.md`. Sizes are not humanized and columns are not padded. An empty directory prints `(empty directory)`. Secret entries such as `.env` are left out, while dotfiles and `node_modules` are listed.

These commands answer in one word instead of a verbose error line: `missing` for an absent path, `forbidden` for a path outside the workspace or a secret path, and `notdir` when `file list` is pointed at a file. `file exists <path>` answers with the type word `file`, `dir`, or `link` for a regular file, a directory, or a symbolic link — the link itself, even when its target is missing — and with `missing` or `forbidden` otherwise. It prints only that word and never echoes the path.

`file head <path> [-n <lines>]` and `file tail <path> [-n <lines>]` print the first or last N numbered lines of a file with the same numbering and line truncation as `file read`. `-n` defaults to 10 and accepts no value above 2000; a count larger than the file prints every line, and an empty file prints `(empty file)`. A directory target prints `notdir`. Other failures keep `file read`'s verbose lines naming the path as typed, such as `File not found: <path>.`, `Outside the workspace: <path>.`, `Secret file: <path>.`, `Not a text file: <path>.`, and `File too large (>5 MB): <path>.`

Malformed arguments print `Usage: file list <path>` (also for `file ls`), `Usage: file stat <path>`, `Usage: file exists <path>`, `Usage: file head <path> [-n <lines>]`, or `Usage: file tail <path> [-n <lines>]`.

- `file list .` lists the workspace root; `file ls src` does the same for `src/`.
- `file stat notes.md` prints one row for that file; `file stat notes` prints a `dir` row.
- `file exists notes.md` prints `file`, and `file exists notes` prints `dir`.
- `file head server.log -n 5` prints the first five numbered lines; `file tail server.log -n 20` prints the last twenty.
