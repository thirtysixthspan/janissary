# File list and file stat

`file list <path>` (also spelled `file ls <path>`) prints one row per entry of a directory, and `file stat <path>` prints one row describing a file or a directory. Both resolve the path against the tab's workspace directory, or its launch directory when the tab has no workspace, and a remote tab answers from its own workspace without reading the local disk. See [[application-commands]] for the settings that gate them and [[file-exists]] for the existence word.

### One-word answers

These commands answer in one word instead of a verbose error line: `missing` for an absent path, `notdir` when `file list` is pointed at a file, and `forbidden` for a path that is outside the workspace or secret. A `forbidden` answer never echoes the requested path.

### Symlinks and containment

A path is refused with `forbidden` when its real location leaves the workspace or lands on a secret location after symbolic links are resolved, even if the path looks ordinary as typed. That covers a link inside the workspace pointing to a directory outside it, one pointing to a file outside it, and one pointing to a credential location under the home directory. Containment is decided from the resolved location of the nearest existing part of the path, so an escaping link cannot be disguised by a missing final segment. A link whose target stays inside the workspace is not refused for that reason.

`file list` also leaves an entry out of its listing when that entry resolves outside the workspace or to a secret location, so a listing cannot describe the size, time, permissions, or name of a linked target the reader would refuse. An entry that vanishes before it can be described still gets a row of zero values.

### Policy ordering

Path policy runs before any listing or stat: the requested path is checked both as typed and on its resolved target, and each listed entry is checked on its resolved target before its row is rendered. Local and remote tabs apply the same rule and print the same `forbidden` word, so the two surfaces cannot disagree about which paths are reachable.
