# Workspacing

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

A workspace is a disposable, isolated clone of your repository that an agent or harness works in instead of the project itself. It exists so you can let an AI agent loose on your code without betting the repo — or your machine — on its judgment: the agent gets a full, real checkout it can build, test, and commit in, while the workspace boundary decides what it can't touch.

Agents and harnesses get a workspace by default. Use `--no-workspace` when you deliberately want one to work in the project checkout instead; `--workspace` (or `-w`) explicitly confirms the default. Two properties define a workspace — disposability and isolation.

**Disposable.** The workspace is a fresh `git clone`, created when its first tab opens and deleted when the last tab sharing it closes. A workspaced tab's ➕ button joins another agent to that same clone, so closing the creator leaves the clone available to the joined tabs. Nothing in it outlives its last user except what was pushed or merged out deliberately. Relaunching the app doesn't bring workspaces back. That makes a workspace cheap to abandon: if an experiment goes sideways, close its tabs.

**Isolated.** On macOS, everything running in a workspaced tab — the shell, the harness, and anything they spawn — is confined by a kernel-enforced sandbox. In practice, from inside the workspace:

- Normal development works: `git commit`, `fetch`, `pull`, `npm install`, builds, virtualenvs, and running a harness that needs its stored login all behave as usual.
- Writing outside the workspace doesn't: no global installs, no editing files elsewhere on disk.
- Reading other projects, sibling workspaces, and your dotfiles is blocked (a handful of harmless ones, like `.gitconfig`, stay readable).
- Credentials and secrets — `.ssh`, `.aws`, cloud CLI credentials, browser profiles, and shell history — are invisible, not just unreadable. An agent can't read them and can't overwrite them. The same holds for the credential files the Claude and OpenCode harnesses keep their provider keys in. Harnesses get their credentials from [tokens you configure](/user-documentation/advanced-agents/tokens) instead. Codex is the exception: its `~/.codex` folder is writable from inside a workspace, so `~/.codex/auth.json` is reachable there until codex is given a forwarded token of its own. If you run a codex harness against a repository you care about, treat its `~/.codex` as readable and writable until that changes.
- Credential-shaped environment variables (`AWS_*`, `GITHUB_TOKEN`, `NPM_TOKEN`, `SSH_AUTH_SOCK`, and similar) are stripped from the process too, so a tool that needs one fails inside the workspace even though the file it would otherwise read is also blocked.
- SSH doesn't work from inside, which is why pushing to GitHub needs a token — see [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent).

Add `--offline` to deny network access too.

Isolation is on by default (`sandboxWorkspaces` in `.janissary/config.json`; it requires macOS). When a workspaced tab is created and isolation isn't actually active — the setting is off, or the platform can't enforce it — the tab says so with a one-line notice, so you're never silently unprotected: `workspace isolation off: sandboxWorkspaces disabled in config` when the setting is off, or `workspace isolation off: sandbox-exec unavailable` when the platform can't enforce it.

One narrow exception to the reading rules above: the running Janissary installation's own `ai/` and `scripts/` directories stay readable even when they sit under your home directory. That's what lets a shipped task file and the `$janissary/scripts/run.mjs` commands it runs (see [Task picker](/user-documentation/command-bar/tasks)) still work from inside a workspaced tab. The rest of the installation, including `node_modules`, stays off limits.

## What else crosses the boundary

<img class="agent-float left" src="/agents/hakim-south.png" alt="" />

Isolation is a list of what's denied, so it's just as useful to know what still gets through. These are the deliberate exceptions, and each one explains a behavior that otherwise looks like a bug:

- **Your shell startup files stay readable.** `.zshrc`, `.zprofile`, `.zshenv`, `.zlogin`, `.bash_profile`, `.bashrc`, and `.profile` are all visible, so the `PATH` additions, aliases, and functions you set up are live inside the workspace and a tool you installed globally is on the path. They are never writable from inside.
- **Version managers stay readable.** `~/.nvm` and `~/.rvm` are visible, which is why a toolchain or harness installed under a different nvm version still runs.
- **The OpenCode model catalog stays readable.** `~/.cache/opencode/models.json` is there, so a workspaced OpenCode sees the models your machine already fetched rather than starting from nothing.
- **`/tmp` is writable but not runnable.** You can read and write `/tmp` and `/private/tmp` as usual; you cannot execute a script you put there. Copy it into the workspace and run it there.
- **`TMPDIR` points somewhere new.** It is redirected to a private `<workspace>.tmp` directory beside your workspace, not your real temporary directory, so two workspaces don't tread on each other's scratch files.

Three things are denied that surprise people, because each is something a normal shell can do:

- **Setuid programs cannot run at all.** `ps` is the one you meet first: it is setuid, the sandbox refuses to execute setuid binaries, and it fails with a permission error rather than a wrong answer.
- **The pasteboard is unreachable.** `pbpaste` inside a workspace returns nothing. The clipboard is there for the app's own copy chords, not for a shell to read.
- **Apple Events are blocked.** `osascript -e 'tell app …'` cannot drive another application from inside the workspace.

## Browsers can't start inside a workspace

One consequence of the reading rules above is worth knowing before it puzzles you: a harness inside a workspace **cannot launch a browser**. Playwright keeps its Chromium under your home directory, which the workspace can't read, so any attempt to start one fails on a permission error. That isn't a bug to work around — it's the boundary doing its job.

If you want a workspaced harness to check its work in a real browser, launch it with `-b`/`--browser` and Janissary provides one from outside the workspace. See [Giving a harness a browser](/user-documentation/advanced-agents/harness#giving-a-harness-a-browser).

That browser is contained in its own right, since handing an AI a browser would otherwise be a way straight back out through `file://` URLs. Two things stop it: the address the harness gets belongs to a guard that refuses `file:` URLs and drops the connection, and the browser itself runs in an empty scratch directory rather than anywhere near your files. On macOS the browser is sandboxed to that directory as well, so even a `file:` read that slipped past the guard finds nothing worth having.

Be aware of the asymmetry: on a machine without macOS sandboxing, or with `sandboxWorkspaces` switched off, the browser runs unconfined and the guard is the only layer left. It's the same trade-off a workspaced tab already makes on a non-macOS host — the disposable clone still applies, the kernel-enforced boundary doesn't.
