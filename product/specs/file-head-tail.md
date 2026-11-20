# File head and tail

`file head <path> [-n <lines>]` and `file tail <path> [-n <lines>]` print the first or last N numbered lines of a file on the current tab, with `-n` defaulting to 10. They resolve the path against the tab's workspace directory, or its launch directory when it has no workspace. See [[application-commands]] for the command settings that gate them.

### Directory targets

A directory target answers with the single word `notdir` in either direction. A symbolic link whose target is a directory answers the same way: the link is resolved and the directory at the resolved location shares that one-word result. A symbolic link to a regular file is read like the file itself.

### Verbose failures

Failures other than a directory keep `file read`'s verbose lines naming the path as typed, including `File not found: <path>.`, `Outside the workspace: <path>.`, `Secret file: <path>.`, `Not a text file: <path>.`, and `File too large (>5 MB): <path>.`. Path policy runs before the directory answer, so an out-of-workspace or secret target never becomes `notdir`.
