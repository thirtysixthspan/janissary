# Workspaced agents

Add `--workspace` to give an agent its own disposable clone of the repository:

```
agent emrah --workspace      agent "emrah" in a fresh clone
agent -w                     random name, same thing
harness claude -w            a harness in a clone (see Harness tabs)
```

The clone is made from your repository's `origin` remote and lands at `$root/workspace/<name>`; the agent's shell starts inside it, so everything the agent does happens in the clone, not your checkout. Why you'd want that — and exactly what the isolation allows and blocks — is covered in [Workspacing](/user-documentation/advanced-agents/workspacing).

Running the command from a directory that isn't in a git repository, or in a repo without an `origin` remote, shows an error and creates no tab.

![The connections panel of a workspaced agent, showing its shell running in the workspace clone's directory.](/screenshots/workspaced-agent.png)

## Pushing to GitHub needs a token

<img class="agent-float" src="/agents/ekrem-south-east.png" alt="" />

Inside the workspace, day-to-day git works without any setup: commit, fetch, pull, branch. Pushing is different. The sandbox blocks SSH keys, so the workspace's `origin` is rewritten to HTTPS — and HTTPS pushes need a credential the sandbox will allow.

That credential is a scoped GitHub token placed in `.janissary/github-token` in your project. With it, `git push` and `gh` (creating and merging PRs) work from inside the workspace. Without it they fail; local development is unaffected either way.

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to just the repositories the agent should reach, with **Contents: Read and write**, **Pull requests: Read and write**, and **Metadata: Read-only** permissions — nothing broader. Save the token value to `.janissary/github-token` (already gitignored; janissary only ever reads this file, never writes to it).

<img class="agent-float left" src="/agents/hamza-south-west.png" alt="" />
## Lifecycle

A workspace lasts exactly as long as its tab:

- **Created** when the tab opens — always a fresh clone.
- **Removed** when the tab closes, along with everything in it that wasn't pushed.
- **Not restored**: `janus --relaunch` brings the agent tab back, but not its workspace — the restored tab starts in its last known working directory. Fresh app launches also clear any workspace directories left behind.

Treat a workspace as scratch space: anything worth keeping should leave through git.
