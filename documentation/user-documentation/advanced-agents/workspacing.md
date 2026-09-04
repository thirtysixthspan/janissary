# Workspacing

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

A workspace is a disposable, isolated clone of your repository that an agent or harness works in instead of the project itself. It exists so you can let an AI agent loose on your code without betting the repo — or your machine — on its judgment: the agent gets a full, real checkout it can build, test, and commit in, while the workspace boundary decides what it can't touch.

Agents and harnesses get a workspace by default. Use `--no-workspace` when you deliberately want one to work in the project checkout instead; `--workspace` (or `-w`) explicitly confirms the default. Two properties define a workspace — disposability and isolation.

**Disposable.** The workspace is a fresh `git clone`, created when its first tab opens and deleted when the last tab sharing it closes. A workspaced tab's ➕ button joins another agent to that same clone, so closing the creator leaves the clone available to the joined tabs. Nothing in it outlives its last user except what was pushed or merged out deliberately. Relaunching the app doesn't bring workspaces back. That makes a workspace cheap to abandon: if an experiment goes sideways, close its tabs.

**Isolated.** On macOS, everything running in a workspaced tab — the shell, the harness, and anything they spawn — is confined by a kernel-enforced sandbox. In practice, from inside the workspace:

- Normal development works: `git commit`, `fetch`, `pull`, `npm install`, builds, virtualenvs, and running a harness that needs its stored login all behave as usual.
- Writing outside the workspace doesn't: no global installs, no editing files elsewhere on disk.
- Reading other projects, sibling workspaces, and your dotfiles is blocked (a handful of harmless ones, like `.gitconfig`, stay readable).
- Credentials and secrets — `.ssh`, `.aws`, cloud CLI credentials, browser profiles, shell history, and the files your AI harnesses keep their own provider keys in — are invisible, not just unreadable. An agent can't read them and can't overwrite them. Harnesses get their credentials from [tokens you configure](/user-documentation/advanced-agents/tokens) instead.
- Credential-shaped environment variables (`AWS_*`, `GITHUB_TOKEN`, `NPM_TOKEN`, `SSH_AUTH_SOCK`, and similar) are stripped from the process too, so a tool that needs one fails inside the workspace even though the file it would otherwise read is also blocked.
- SSH doesn't work from inside, which is why pushing to GitHub needs a token — see [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent).

Add `--offline` to deny network access too.

Isolation is on by default (`sandboxWorkspaces` in `.janissary/config.json`; it requires macOS). When a workspaced tab is created and isolation isn't actually active — the setting is off, or the platform can't enforce it — the tab says so with a one-line notice, so you're never silently unprotected.

## Browsers can't start inside a workspace

One consequence of the reading rules above is worth knowing before it puzzles you: a harness inside a workspace **cannot launch a browser**. Playwright keeps its Chromium under your home directory, which the workspace can't read, so any attempt to start one fails on a permission error. That isn't a bug to work around — it's the boundary doing its job.

If you want a workspaced harness to check its work in a real browser, launch it with `-b`/`--browser` and Janissary provides one from outside the workspace. See [Giving a harness a browser](/user-documentation/advanced-agents/harness#giving-a-harness-a-browser).

That browser is contained in its own right, since handing an AI a browser would otherwise be a way straight back out through `file://` URLs. Two things stop it: the address the harness gets belongs to a guard that refuses `file:` URLs and drops the connection, and the browser itself runs in an empty scratch directory rather than anywhere near your files. On macOS the browser is sandboxed to that directory as well, so even a `file:` read that slipped past the guard finds nothing worth having.

Be aware of the asymmetry: on a machine without macOS sandboxing, or with `sandboxWorkspaces` switched off, the browser runs unconfined and the guard is the only layer left. It's the same trade-off a workspaced tab already makes on a non-macOS host — the disposable clone still applies, the kernel-enforced boundary doesn't.
