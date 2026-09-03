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

Once a workspace exists, the ➕ button in that tab's metadata row creates another agent **inside the same clone**. It does not make a sibling clone. Both tabs see each other's files immediately, and closing the tab that created the workspace does not interrupt the joined agent. The command forms `agent` and `harness` still create fresh workspaces; sharing is the metadata button's job.

## If every workspace suddenly fails to start

<img class="agent-float left" src="/agents/yusuf-south.png" alt="" />

Setting up a clone also marks it as trusted in Claude's own configuration file, `~/.claude.json`, so a claude harness doesn't stop to ask about the new directory. If you don't have that file yet, one is created; if you do, everything already in it is kept.

If the file can't be read, isn't valid JSON, or holds something other than what Claude writes there, setting up the workspace stops and the file is left exactly as it was. Nothing repairs it for you, so every workspaced tab fails to start until you fix or delete `~/.claude.json` — which is the symptom to recognize, since the failure has nothing to do with your own repository. Working with `--no-workspace` is unaffected.

![The connections panel of a workspaced agent, showing its shell running in the workspace clone's directory.](/screenshots/workspaced-agent.png)

## Pushing to GitHub needs a token

<img class="agent-float" src="/agents/cavus-south.png" alt="" />

Inside the workspace, day-to-day git works without any setup: commit, fetch, pull, branch. Pushing is different. The sandbox blocks SSH keys, so the workspace's `origin` is rewritten to HTTPS — and HTTPS pushes need a credential the sandbox will allow.

That credential is a scoped GitHub token placed in `.janissary/github-token` in your project. With it, `git push` and `gh` (creating and merging PRs) work from inside the workspace. Without it they fail; local development is unaffected either way.

The token reaches the workspace whether or not isolation is actually active on the machine running the tab. Isolation needs macOS, so a Linux host runs without it — the tab says so when it opens — but pushing from that workspace still works the same way, through the same token.

[Tokens for agents](/user-documentation/advanced-agents/tokens) covers how to create the token, which permissions it needs, where to save it, and how it reaches an agent or harness launched on another machine with `on <address>`.

Pushing from inside a workspace never uses a credential from your own git config or one cached elsewhere on your machine, such as an old keychain-stored login — only the token in `.janissary/github-token` is used. That keeps a stale cached credential from intercepting the push and failing with `Write access to repository not granted` even though your token is valid.

Commits are a separate matter, and they *are* yours. The name and email git resolves for your project — the same ones a commit you make outside the workspace carries — are passed into every workspaced tab, so an agent's commits are attributed to you. This holds on a machine reached with `on <address>` too: the identity travels with the tab rather than being taken from the remote account, which would otherwise sign the commits as whoever that host logs in as, or refuse to commit at all if that account has no name and email set.

A codex harness needs one extra thing. Codex hides credential-looking variables from the commands it runs, and the GitHub token looks exactly like one — so a push from a codex tab fails as if you had never set a token up. The standard `.codex/config.toml` that `janus init` writes tells codex to keep it. If you scaffolded the project with `janus init` and trusted the project the first time you opened codex in it, this is already handled. Claude and opencode tabs need nothing extra — they pass the token through to `git` and `gh` as-is.

## Lifecycle

<img class="agent-float left" src="/agents/demir-south-east.png" alt="" />

A workspace lasts exactly as long as the tabs sharing it:

- **Created** when the tab opens — always a fresh clone.
- **Cancelled** if you close the tab, or quit the app, while the clone is still running — it stops right away instead of finishing in the background.
- **Shared** when you use a workspaced tab's ➕ button; every joined tab works in the same directory.
- **Kept** when one sharing tab closes and another still uses it.
- **Removed** when the last sharing tab closes, along with everything in it that wasn't pushed.
- **Not restored**: `janus --relaunch` brings the agent tab back, but not its workspace — the restored tab starts in its last known working directory. Fresh app launches also clear any workspace directories left behind.

Treat a workspace as scratch space: anything worth keeping should leave through git.
