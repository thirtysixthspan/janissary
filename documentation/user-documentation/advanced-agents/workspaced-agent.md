# Workspaced agents

Agents and harnesses use disposable clones by default:

```
agent emrah                  agent "emrah" in a fresh clone
agent                        random name, same thing
harness claude               a harness in a clone (see Harness tabs)
agent emrah --no-workspace   opt out and use the project checkout
```

The clone is made from your repository's `origin` remote and lands at `$root/workspace/<name>`; the agent's shell starts inside it, so everything the agent does happens in the clone, not your checkout. `-w`/`--workspace` explicitly confirms the default. `--no-workspace` opts out. Why you'd want a workspace — and exactly what the isolation allows and blocks — is covered in [Workspacing](/user-documentation/advanced-agents/workspacing).

Running the command from a directory that isn't in a git repository, or in a repo without an `origin` remote, shows an error and creates no tab.

The tab appears right away, marked busy, while the clone runs in the background — anything you type into it joins its [command queue](/user-documentation/command-bar/queue) and runs once the clone finishes. A ready confirmation (and the isolation notice, if isolation isn't actually active) posts to the tab once the clone completes; if the clone fails instead, the tab reports the failure and closes on its own shortly after.

![The connections panel of a workspaced agent, showing its shell running in the workspace clone's directory.](/screenshots/workspaced-agent.png)

## Pushing to GitHub needs a token

<img class="agent-float" src="/agents/cavus-south.png" alt="" />

Inside the workspace, day-to-day git works without any setup: commit, fetch, pull, branch. Pushing is different. The sandbox blocks SSH keys, so the workspace's `origin` is rewritten to HTTPS — and HTTPS pushes need a credential the sandbox will allow.

That credential is a scoped GitHub token placed in `.janissary/github-token` in your project. With it, `git push` and `gh` (creating and merging PRs) work from inside the workspace. Without it they fail; local development is unaffected either way.

For an agent or harness launched on another machine with `on <address>`, Janissary forwards this token through the SSH connection and uses it only for that remote workspace's processes. You don't need to copy the token file to the remote machine, and Janissary doesn't save the forwarded token there. If the local project has no token, a token configured in the remote project's own `.janissary/github-token` is used instead.

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to just the repositories the agent should reach, with **Contents: Read and write**, **Pull requests: Read and write**, and **Metadata: Read-only** permissions — nothing broader. Save the token value to `.janissary/github-token` (already gitignored; janissary only ever reads this file, never writes to it).

Pushing from inside a workspace never touches your own git config or an ambient GitHub credential cached elsewhere on your machine, such as an old keychain-stored login — only the token in `.janissary/github-token` is used. That keeps a stale cached credential from intercepting the push and failing with `Write access to repository not granted` even though your token is valid.

A codex harness needs one extra thing. Codex hides credential-looking variables from the commands it runs, and the GitHub token looks exactly like one — so a push from a codex tab fails as if you had never set a token up. The standard `.codex/config.toml` that `janus init` writes tells codex to keep it. If you scaffolded the project with `janus init` and trusted the project the first time you opened codex in it, this is already handled. Claude and opencode tabs need nothing extra — they pass the token through to `git` and `gh` as-is.

## Lifecycle

<img class="agent-float left" src="/agents/demir-south-east.png" alt="" />

A workspace lasts exactly as long as its tab:

- **Created** when the tab opens — always a fresh clone.
- **Cancelled** if you close the tab, or quit the app, while the clone is still running — it stops right away instead of finishing in the background.
- **Removed** when the tab closes, along with everything in it that wasn't pushed.
- **Not restored**: `janus --relaunch` brings the agent tab back, but not its workspace — the restored tab starts in its last known working directory. Fresh app launches also clear any workspace directories left behind.

Treat a workspace as scratch space: anything worth keeping should leave through git.
