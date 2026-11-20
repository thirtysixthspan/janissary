# File exists

`file exists <path>` answers a cheap existence question about a path on the current tab with a single word, without echoing the path back. It resolves the path against the tab's workspace directory, or its launch directory when the tab has no workspace. See [[application-commands]] for the command settings that gate it.

### One-word answers

The answer is one of `file`, `dir`, `link`, `missing`, or `forbidden`. A regular file answers `file`, a directory answers `dir`, and a symbolic link answers `link` — the link itself, not the kind of thing it points to. A genuinely absent path answers `missing`. A path outside the workspace, a secret path, or a path that escapes the workspace through a symlink answers `forbidden`. These are ordinary answers rather than error lines, and none of them contains the requested path.

### Symlinks and absent targets

A dangling symlink — one whose target does not exist — still answers `link`, because the answer describes the link itself rather than its target. A path that passes through a symlink pointing outside the workspace answers `forbidden` even when its final segment is absent: containment is decided from the resolved location of the nearest existing part of the path, so an escaping symlink cannot be disguised by a missing leaf. A plain absent path with no escaping symlink in it answers `missing`, however many of its segments do not yet exist.

### Policy ordering

Path policy runs before the type lookup. A path that is lexically outside the workspace or secret is refused before the filesystem is consulted, and a path that resolves outside the workspace through a symlink is refused on its real target. Only a path that passes both checks is inspected for its type, so a `missing` answer always means the path is contained and a `link` answer always describes a symlink the caller is allowed to see.
