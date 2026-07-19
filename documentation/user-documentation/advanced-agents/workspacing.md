# Workspacing

<img class="agent-float" src="/agents/yusuf-south-west.png" alt="" />

A workspace is a disposable, isolated clone of your repository that an agent or harness works in instead of the project itself. It exists so you can let an AI agent loose on your code without betting the repo — or your machine — on its judgment: the agent gets a full, real checkout it can build, test, and commit in, while the workspace boundary decides what it can't touch.

Ask for one with `--workspace` (or `-w`) when creating an [agent](/user-documentation/advanced-agents/workspaced-agent) or a [harness](/user-documentation/advanced-agents/harness). Two properties define it — disposability and isolation.

**Disposable.** The workspace is a fresh `git clone`, created when the tab opens and deleted when the tab closes. Nothing in it outlives the tab except what was pushed or merged out deliberately. Relaunching the app doesn't bring workspaces back. That makes a workspace cheap to abandon: if an experiment goes sideways, close the tab.

<img class="agent-float left" src="/agents/malik-south.png" alt="" />

**Isolated.** On macOS, everything running in a workspaced tab — the shell, the harness, and anything they spawn — is confined by a kernel-enforced sandbox. In practice, from inside the workspace:

- Normal development works: `git commit`, `fetch`, `pull`, `npm install`, builds, virtualenvs, and running a harness that needs its stored login all behave as usual.
- Writing outside the workspace doesn't: no global installs, no editing files elsewhere on disk.
- Reading other projects, sibling workspaces, and your dotfiles is blocked (a handful of harmless ones, like `.gitconfig`, stay readable).
- Credentials and secrets — `.ssh`, `.aws`, cloud CLI credentials, browser profiles, shell history — are invisible, not just unreadable.
- Credential-shaped environment variables (`AWS_*`, `GITHUB_TOKEN`, `NPM_TOKEN`, `SSH_AUTH_SOCK`, and similar) are stripped from the process too, so a tool that needs one fails inside the workspace even though the file it would otherwise read is also blocked.
- SSH doesn't work from inside, which is why pushing to GitHub needs a token — see [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent).

Add `--offline` to deny network access too.

Isolation is on by default (`sandboxWorkspaces` in `.janissary/config.json`; it requires macOS). When a workspaced tab is created and isolation isn't actually active — the setting is off, or the platform can't enforce it — the tab says so with a one-line notice, so you're never silently unprotected.
