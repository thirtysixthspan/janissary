On a normal launch the state directory is cleared before the UI renders, so every session starts fresh.

The `--relaunch` flag skips that cleanup: the previous session's harness capture, recording and transcript files, browser logs, git-failure output, and workspace clones are kept, and every parked remote session is reattached (see `relaunch.md`). No tab is restored. Every launch, `--relaunch` included, opens the same single zsh shell tab (see `tabs.md`).

No tab's state is saved. Agent tabs, view tabs, harness tabs, and plugin tabs alike are live and in-memory, and none of them is written to disk to be recreated by a later launch.
