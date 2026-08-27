# Tokens for agents

Janissary reads two optional token files from your project's `.janissary/` directory. Each is a plain text file holding just the token value. Janissary only ever reads them, never writes to them, and `.janissary/` is gitignored by default so neither one gets committed.

| File | What it gives a workspaced tab | Set it up when |
| --- | --- | --- |
| `.janissary/github-token` | working `git push` and `gh` | you want to push or open pull requests from inside a workspace |
| `.janissary/claude-token` | a signed-in `claude` harness | the machine running the tab has no usable keychain |

Neither file is required. Without them, workspaces still clone, run, commit, fetch, and pull.

## Get a GitHub token

<img class="agent-float" src="/agents/bilal-south-east.png" alt="" />

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to just the repositories the agent should reach, with **Contents: Read and write**, **Pull requests: Read and write**, and **Metadata: Read-only** permissions. Nothing broader.

Save the value to `.janissary/github-token` in your project root:

```
your-project/
  .janissary/
    github-token
```

A workspace rewrites its `origin` to HTTPS because the sandbox can't authenticate git over SSH, which is why this token exists at all. [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent) covers what changes once you add it, including the one extra step a codex harness needs.

## Get a Claude token

Run `claude setup-token` on a machine with a browser. It signs you in and prints a long-lived token tied to your Claude subscription. Save that value to `.janissary/claude-token`.

A workspaced `claude` harness normally signs in through the keychain of the machine it runs on, which works on macOS. Everywhere else the harness can't reach its saved credentials from inside the sandbox, so it starts up reporting itself logged out even though you're signed in outside the workspace. The token file is what closes that gap.

The token goes to every workspaced tab, not only harness tabs, so an agent whose shell runs `claude` picks it up the same way. If you already export `CLAUDE_CODE_OAUTH_TOKEN` in your own environment, that keeps working as before, and a token file takes precedence over it.

## How a token reaches a workspace

<img class="agent-float left" src="/agents/idris-south-west.png" alt="" />

Janissary reads both files once when it starts, then hands the values to each workspaced tab's processes as they launch. Nothing is copied into the workspace itself, so a token never lands in a clone you might push. Editing a token file takes effect on the next launch of Janissary, not on the next tab.

A token reaches the tab whether or not isolation is actually active on that machine. Isolation needs macOS, so a Linux host runs without it, and the credential arrives the same way either way.

## How tokens reach a remote

The two tokens behave differently on a [remote agent or harness](/user-documentation/advanced-agents/remote-agents), so this is the part worth reading twice.

**The GitHub token is forwarded.** Janissary sends your project's token through the encrypted SSH connection and injects it only into that remote workspace's processes. It's never written to the remote filesystem, so you don't need to copy the file to the other machine. If your project has no token, the remote falls back to a `.janissary/github-token` in its own project. Both installations need to be recent enough to forward one, and a launch against an older install stops with a version message rather than opening a tab that quietly can't push. When the tab opens, a line about the token means the forwarded one isn't what's in use.

**The Claude token is not forwarded.** The remote doesn't read a `.janissary/claude-token` of its own either. A remote `claude` harness signs in with whatever that machine already gives it: its own keychain, or a `CLAUDE_CODE_OAUTH_TOKEN` exported in the remote account's environment. If you need a remote harness authenticated, set that variable in the remote user's shell startup file.
