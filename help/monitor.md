### monitor

Start a persona-driven AI monitor on the current tab, or target other tabs or groups and report into a reporting tab. A tab target can use its label or display alias, matched case-insensitively; use `group:<n>` to target a group.

**Usage**

`monitor <persona> [<tab-or-alias>|group:<n> ...]`

`monitor ask <name> <question>`

**Use cases**

- Watch one or more tabs or groups for activity.
- Ask an already-running monitor to perform a follow-up.

**Examples**

- `monitor bilal` starts the `bilal` monitor on the current tab.
- `monitor bilal agent2` watches the tab with the label `agent2`.
- `monitor bilal reviewer group:3` watches the tab with the display alias `reviewer` and every tab in group 3.
- `monitor ask bilal Summarize the latest changes` sends a question to a running monitor.
