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
macOS and inactive otherwise, and the notice shown in the tab is the remote's) and its own
repository's `origin` transport. The credentials are the exception: this project's
`.janissary/github-token`, `.janissary/claude-token`, and `.janissary/opencode-token` are all
forwarded on the provisioning frame, each falling back to the remote project's own file when nothing
is sent. A remote tab records
no local workspace directory, so closing it deletes nothing locally; the remote server removes the
clone when its ssh session ends. See [[remote-server]].

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

### Harness authentication

A workspaced `claude` harness authenticates to Anthropic with whatever credential it can reach from
inside the workspace, and on a machine without a usable Keychain there is none: the credentials file
the CLI falls back to (`~/.claude/.credentials.json`) is one of the sandbox's explicitly denied secret
paths (see [[sandbox]]), so the harness starts and reports itself logged out. macOS tabs are unaffected
— Keychain reads, and the one narrow write that lets a refreshed token persist, are carved in.

A long-lived subscription token placed in `.janissary/claude-token` closes that gap. When the file is
present, its contents are injected into every workspaced tab's environment as
`CLAUDE_CODE_OAUTH_TOKEN`, and the harness authenticates with it instead of reaching for the
machine's credential store. The file is read once at startup, trimmed of surrounding whitespace, and
treated as absent when empty; janissary only ever reads it, never writes to it. Without it, nothing
changes from before — a workspaced harness behaves exactly as it always has, which on macOS is
generally fine and elsewhere is not.

The token is injected for every workspaced spawn, not only a harness tab's: an agent tab's shell can
invoke `claude` just as directly. Injection does not depend on isolation being active, for the same
reason the GitHub token's does not. Unlike `GH_TOKEN`, an ambient `CLAUDE_CODE_OAUTH_TOKEN` in the
environment janissary itself was started with is not stripped — provider credentials are deliberately
exempt from the environment scrub — so a user who exports the variable themselves keeps working
unchanged, and a configured token file takes precedence over it.

An `opencode` harness has the same file, `.janissary/opencode-token`, injected as `OPENCODE_API_KEY`
— the variable the OpenCode Zen and OpenCode Go providers declare — under every rule above: any
workspaced spawn, isolation-independent, off the scrub list, forwarded to a remote with the remote's
own file as the fallback. The credential itself is a static API key with no refresh and no expiry, so
unlike the Claude token there is nothing to re-mint on a schedule.

For opencode the token file is not optional inside a workspace. opencode keeps its credentials in
`~/.local/share/opencode/auth.json`, and that file is a denied secret path (see [[sandbox]]) — a
workspaced tab cannot read it or write it, even though the directory around it stays writable for the
session database and logs. So a workspaced opencode harness authenticates from
`.janissary/opencode-token` or from the environment, never from the machine's own opencode login,
whether the tab is local or remote. This is deliberate: the file holds every provider key opencode
has been given, and a disposable workspace has no business reading them.

The consequence is worth stating rather than discovering. `OPENCODE_API_KEY` is what the OpenCode Zen
and OpenCode Go providers read, and nothing else. An opencode configured by `opencode auth login`
against Anthropic, Google, or OpenAI has that key in the denied file, and the token file does not
replace it; that provider works inside a workspace only if its own variable
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or for Google `GOOGLE_API_KEY`,
`GOOGLE_GENERATIVE_AI_API_KEY`, or `GEMINI_API_KEY`) is present in the environment
janissary was started with, which the scrub passes through untouched.

The Google provider has a token file of its own, `.janissary/gemini-token`, injected as
`GEMINI_API_KEY` under every rule above and forwarded to a remote the same way. It carries the same
credential the denied `auth.json` holds, by the route a workspace is allowed to use, so a Google
provider works from a workspaced tab without anything being exported by hand. `GOOGLE_API_KEY` and
`GOOGLE_GENERATIVE_AI_API_KEY` are equivalent to the provider and still pass the scrub, so someone
who prefers to export one of those is unaffected; janissary injects only `GEMINI_API_KEY`.

The Vertex providers are the exception with no answer. They authenticate from
`GOOGLE_APPLICATION_CREDENTIALS`, which names a file rather than carrying a key: the variable
survives the scrub, so the setup looks configured, but the file it points at is denied inside the
workspace (see [[sandbox]]). A Vertex-configured opencode cannot authenticate from a workspaced tab,
and the way out is an API-key provider rather than a wider sandbox.

On a remote launch the token is forwarded on the provisioning frame exactly as the GitHub token is,
injected only into that remote tab's workspaced processes and never written to the remote
filesystem, with the remote project's own `.janissary/claude-token` as the fallback when nothing is
sent. It carries no notice of its own, unlike the GitHub token: a harness with no credential reports
itself logged out immediately rather than failing much later, and most remote launches legitimately
have no Claude token on either machine. A remote installation too old to honor the forwarded token is
refused at the handshake, the same way one too old to honor the GitHub token is. See
[[remote-server]].

### Workspace lifecycle

Workspace directories are ephemeral:
- **Normal launch**: `.janissary/workspace/` is cleared before rendering.
- **Tab creation**: The tab (agent or harness) appears immediately; the clone runs in the
  background and never blocks the rest of the app. Closing the tab before the clone finishes
  cancels it right away, the same as any other close.
- **Tab close**: The workspace directory is removed when the tab is closed. The tab closes immediately and the clone is deleted in the background, so removing a large workspace never freezes the UI. If the app exits before a background deletion finishes, that clone is still cleaned up as part of shutdown.
- **`--relaunch`**: Workspace directories are not recreated; restore falls back to the tab's last known working directory.
