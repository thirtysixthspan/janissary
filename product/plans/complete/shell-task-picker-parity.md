# Make the task picker work in shell tabs

**Complexity: 5/10.** The shared task picker and overlay are present, but selecting a task inserts through the agent command bar's registered caret handle rather than the shell tab's bar.

## Goal

Let shell tabs open the shared task picker and insert the selected task command at the shell bar's caret without submitting it.

## Approach

Register each shell command bar's insertion callback by tab label. Route task selection to the current shell's callback while retaining the existing agent and harness paths.

## Implementation

1. Add a host-owned map of plugin command-line insertion callbacks and register/unregister the shell bar by label.
2. Pass the callback map and active shell label through the picker hook to task selection.
3. Add tests for shell task selection, overlay visibility, and no PTY submission; update the shell tab spec.
4. Run diff checks and remove the resolved PR backlog entry.

## Tests

Run `./scripts/run.mjs check-diff` after each implementation step and after tests.

## Out of scope

Changing agent command-line insertion or sending selected task commands directly to a shell.
