# Workspaced Agent Specification

Janissary supports creating agents with disposable, isolated workspaces.

## Definition

A workspaced agent is an agent tab with its own cloned workspace. This workspace is an independent clone of the `origin` remote of the root repository detected from the directory where the command is executed.

### Workspace agent tab

`agent <name>` creates a tab with a cloned workspace by default — a `git clone` of the root repository's `origin` remote, detected from the current directory. The workspace is created at `.janissary/workspace/<name>/` and the agent's shell spawns there. `-w`/`--workspace` explicitly confirms the default. `--no-workspace` opts out and starts the agent in the project checkout instead. If both forms are present, `--no-workspace` wins.

If no git repository is found from the current directory, or the repository has no `origin` remote, an error is shown and no tab is created.

The tab appears immediately, marked busy, with its workspace directory already known — it does not wait for the clone to finish. Anything typed into it while the clone is still running is queued and runs once the tab goes idle, the same as typing into any other busy agent tab. The creator tab's "Agent ready" confirmation (and the sandbox notice, if any) is posted once the clone actually finishes, not before. If the clone fails after the tab was created, the creator tab reports the failure and the half-created tab closes on its own shortly after.

The "New agent here" button (➕) in a tab's metadata row creates a new agent tab rooted at that tab's directory. When the source tab is itself workspaced, the new agent tab gets its own cloned workspace too, following the same immediate-tab/busy/clone/ready flow described above — the ready confirmation, any sandbox notice, and clone failures are reported as notifications rather than into a transcript, since the source tab may be a harness with no transcript of its own.

### Workspace harness tab

`harness <name>` creates a harness tab with a cloned workspace by default using the same
mechanism. The workspace is named after the harness tab's unique label (e.g. `claude`, `claude-2`)
and the harness PTY starts there. `-w`/`--workspace` explicitly confirms the default;
`--no-workspace` opts out, and wins if both forms are present. Otherwise identical to an agent
workspace: `git clone` of `origin`, stored at `.janissary/workspace/<label>/`, removed when the tab is closed.

### Remote workspaces

`agent <name> on <address>` and `harness <name> on <address>` create a workspaced tab the same way,
except the workspace lives under the **remote** host's project root rather than this machine's, and
is governed entirely by that host: its sandbox policy (so isolation is active where the remote is
macOS and inactive otherwise, and the notice shown in the tab is the remote's), its own
`.janissary/github-token`, and its own repository's `origin` transport. Nothing is forwarded from
here. A remote tab records no local workspace directory, so closing it deletes nothing locally; the
remote server removes the clone when its ssh session ends. See [[remote-server]].

### Isolation

On macOS, a workspaced tab's processes (shell, harness PTY, or ACP session, and anything they
spawn) are confined to the workspace directory by a kernel-enforced Seatbelt sandbox — see
[[sandbox]] for the full filesystem/IPC/environment policy. Isolation is on by default
(`sandboxWorkspaces` in `.janissary/config.json`) and requires `sandbox-exec`; when it isn't
actually active for a newly created workspaced tab, a one-line notice is appended to that tab's
transcript. `--offline` additionally denies network access for the tab.

### GitHub authentication

The initial clone (done outside the sandbox, by the janissary process itself) uses whatever transport the root repository's `origin` already uses — SSH included, since that step isn't sandboxed. Once cloned, the workspace's own `origin` is rewritten to HTTPS: later git operations run *inside* the workspaced tab's sandbox, which cannot authenticate over SSH (see [[sandbox]]). If a scoped GitHub token is configured (`.janissary/github-token`), it is injected into the workspaced tab's environment, letting `git push` and `gh` (PR creation, merging) authenticate over that HTTPS remote from inside the sandbox. Without a token configured, the workspace still works for local development (commit, fetch, pull); pushing to GitHub or using `gh` from inside the workspace will fail.

For `git push` specifically, the token reaches git through a credential helper the workspace sets on itself at provisioning time: `!gh auth git-credential`, which checks `GH_TOKEN` in its environment before falling back to `gh`'s own keychain-stored OAuth token. That helper is configured in the clone's local git config only — the user's global config is never modified — and the local helper list is explicitly *reset* (set to the empty string) before it is added. The reset is load-bearing: git accumulates `credential.helper` across the system, global, and local scopes and the first helper to answer a query wins, so an ambient `osxkeychain` entry — the macOS default, and commonly holding a stale token `gh` stored on some earlier login — would otherwise answer first and `gh` would never be consulted. The symptom when that happens is a push rejected with a 403 "Write access to repository not granted" despite a valid `GH_TOKEN` being present, since the credential git actually presented came from the keychain, not the token. Note that the sandbox does not prevent this on its own: `~/.gitconfig` and `Library/Keychains` are both deliberate read carve-ins (see [[sandbox]]), so a sandboxed git reads the ambient helper config and queries the keychain successfully.

Injection does not depend on isolation being active. The clone's `origin` is rewritten to HTTPS and
its credential helper is configured on every host, so a workspaced tab needs the token equally on a
machine where isolation is off or unavailable — a non-macOS remote, most commonly. Such a tab gets
`GH_TOKEN` and the accompanying `GH_CONFIG_DIR` redirect exactly as a confined one does; what it does
not get is the environment scrubbing and filesystem confinement, which are the sandbox's own and
absent there by definition.

On a remote launch the token is forwarded from the initiating project rather than read on the far
side (see [[remote-server]]), and the tab says when that is not what happened — when the workspace is
running on the remote project's own token, or on none at all. Silence means the forwarded token is in
use. A remote installation too old to honor a forwarded token is refused at the handshake instead of
provisioning a workspace that cannot push.

A codex harness needs one thing more. Codex filters the environment it hands to every command it runs, and its own default policy drops any variable whose name looks credential-shaped — `GH_TOKEN` among them — so the injected token is stripped again before `git push` or `gh` can use it. The project's standard codex configuration (`.codex/config.toml`, installed by `janus init` — see [[cli]]) therefore marks `GH_TOKEN` and `GITHUB_TOKEN` as included in that policy, leaving the rest of codex's default exclusions in force. Without those entries a workspaced codex tab fails exactly as though no token were configured at all, even though one was injected. Codex reads a project's configuration only once that project is trusted in the user's own codex settings; until then the entries have no effect.

That requirement is codex's alone. The claude and opencode harnesses hand their own environment to the commands they run unchanged, so the injected `GH_TOKEN` reaches `git` and `gh` from those tabs with no configuration of any kind — opencode has no environment-filtering setting to configure, and janissary ships no opencode configuration.

### Workspace lifecycle

Workspace directories are ephemeral:
- **Normal launch**: `.janissary/workspace/` is cleared before rendering.
- **Tab creation**: The tab (agent or harness) appears immediately; the clone runs in the
  background and never blocks the rest of the app. Closing the tab before the clone finishes
  cancels it right away, the same as any other close.
- **Tab close**: The workspace directory is removed when the tab is closed. The tab closes immediately and the clone is deleted in the background, so removing a large workspace never freezes the UI. If the app exits before a background deletion finishes, that clone is still cleaned up as part of shutdown.
- **`--relaunch`**: Workspace directories are not recreated; restore falls back to the tab's last known working directory.
