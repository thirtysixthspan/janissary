# Workspaced Agent Specification

Janissary supports creating agents with disposable, isolated workspaces.

## Definition

A workspaced agent is an agent tab with its own cloned workspace. This workspace is an independent clone of the `origin` remote of the root repository detected from the directory where the command is executed.

### Workspace agent tab

`agent <name> --workspace` (or `-w`) creates a tab with a cloned workspace — a `git clone` of the root repository's `origin` remote, detected from the current directory. The workspace is created at `.janissary/workspace/<name>/` and the agent's shell spawns there. Bare `agent --workspace` picks a random unused name with a workspace.

If no git repository is found from the current directory, or the repository has no `origin` remote, an error is shown and no tab is created.

### Workspace harness tab

`harness <name> -w` (or `--workspace`) creates a harness tab with a cloned workspace using the same
mechanism. The workspace is named after the harness tab's unique label (e.g. `claude`, `claude-2`)
and the harness PTY starts there. Otherwise identical to an agent workspace: `git clone` of `origin`,
stored at `.janissary/workspace/<label>/`, removed when the tab is closed.

### Isolation

On macOS, a workspaced tab's processes (shell, harness PTY, or ACP session, and anything they
spawn) are confined to the workspace directory by a kernel-enforced Seatbelt sandbox — see
[[sandbox]] for the full filesystem/IPC/environment policy. Isolation is on by default
(`sandboxWorkspaces` in `.janissary/config.json`) and requires `sandbox-exec`; when it isn't
actually active for a newly created workspaced tab, a one-line notice is appended to that tab's
transcript. `--offline` additionally denies network access for the tab.

### Workspace lifecycle

Workspace directories are ephemeral:
- **Normal launch**: `.janissary/workspace/` is cleared before rendering.
- **Tab close**: The workspace directory is removed when the tab is closed.
- **`--relaunch`**: Workspace directories are not recreated; restore falls back to the tab's last known working directory.

