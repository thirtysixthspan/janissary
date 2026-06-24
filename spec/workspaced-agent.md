# Workspaced Agent Specification

Janissary supports creating agents with disposable, isolated workspaces.

## Definition

A workspaced agent is an agent tab with its own cloned workspace. This workspace is a shared clone of the root repository detected from the directory where the command is executed.

### Workspace agent tab

`agent <name> --workspace` (or `-w`) creates a tab with a cloned workspace — a `git clone --shared` of the root repository detected from the current directory. The workspace is created at `.janissary/workspace/<name>/` and the agent's shell spawns there. Bare `agent --workspace` picks a random unused name with a workspace.

If no git repository is found from the current directory, an error is shown and no tab is created.

### Workspace lifecycle

Workspace directories are ephemeral:
- **Normal launch**: `.janissary/workspace/` is cleared before rendering.
- **Tab close**: The workspace directory is removed when the tab is closed.
- **`--relaunch`**: Workspace directories are not recreated; restore falls back to the tab's last known working directory.

