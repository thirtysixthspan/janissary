# Workspaced Agent Specification

Janissary supports creating agents with disposable, isolated workspaces.

## Definition

A workspaced agent is an agent tab with its own cloned workspace. This workspace is an independent clone of the `origin` remote of the root repository detected from the directory where the command is executed.

### Workspace agent tab

`agent <name> --workspace` (or `-w`) creates a tab with a cloned workspace — a `git clone` of the root repository's `origin` remote, detected from the current directory. The workspace is created at `.janissary/workspace/<name>/` and the agent's shell spawns there. Bare `agent --workspace` picks a random unused name with a workspace.

If no git repository is found from the current directory, or the repository has no `origin` remote, an error is shown and no tab is created.

The tab appears immediately, marked busy, with its workspace directory already known — it does not wait for the clone to finish. Anything typed into it while the clone is still running is queued and runs once the tab goes idle, the same as typing into any other busy agent tab. The creator tab's "Agent ready" confirmation (and the sandbox notice, if any) is posted once the clone actually finishes, not before. If the clone fails after the tab was created, the creator tab reports the failure and the half-created tab closes on its own shortly after.

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

### GitHub authentication

The initial clone (done outside the sandbox, by the janissary process itself) uses whatever transport the root repository's `origin` already uses — SSH included, since that step isn't sandboxed. Once cloned, the workspace's own `origin` is rewritten to HTTPS: later git operations run *inside* the workspaced tab's sandbox, which cannot authenticate over SSH (see [[sandbox]]). If a scoped GitHub token is configured (`.janissary/github-token`), it is injected into the workspaced tab's environment, letting `git push` and `gh` (PR creation, merging) authenticate over that HTTPS remote from inside the sandbox. Without a token configured, the workspace still works for local development (commit, fetch, pull); pushing to GitHub or using `gh` from inside the workspace will fail.

### Workspace lifecycle

Workspace directories are ephemeral:
- **Normal launch**: `.janissary/workspace/` is cleared before rendering.
- **Tab creation**: The tab (agent or harness) appears immediately; the clone runs in the
  background and never blocks the rest of the app. Closing the tab before the clone finishes
  cancels it right away, the same as any other close.
- **Tab close**: The workspace directory is removed when the tab is closed. The tab closes immediately and the clone is deleted in the background, so removing a large workspace never freezes the UI. If the app exits before a background deletion finishes, that clone is still cleaned up as part of shutdown.
- **`--relaunch`**: Workspace directories are not recreated; restore falls back to the tab's last known working directory.

