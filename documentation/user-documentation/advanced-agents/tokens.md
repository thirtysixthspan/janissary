# Tokens for agents

Janissary reads three optional token files from your project's `.janissary/` directory. Each is a plain text file holding just the token value. Janissary only ever reads them, never writes to them, and `.janissary/` is gitignored by default so none of them gets committed.

| File | What it gives a workspaced tab | Set it up when |
| --- | --- | --- |
| `.janissary/github-token` | working `git push` and `gh` | you want to push or open pull requests from inside a workspace |
| `.janissary/claude-token` | a signed-in `claude` harness | the machine running the tab has no usable keychain |
| `.janissary/opencode-token` | a signed-in `opencode` harness | the machine running the tab has never run `opencode auth login` |

None of them is required. Without them, workspaces still clone, run, commit, fetch, and pull.

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

## Get an OpenCode key

Sign in at OpenCode, copy your API key, and save it to `.janissary/opencode-token`. It's a static key, so there's nothing to refresh and no expiry to plan around.

Most of the time you won't need this one. An `opencode` harness reads the credentials already on the machine it runs on, and a workspace can reach them, so a tab on your own laptop works as soon as you've run `opencode auth login` once. The file matters on a machine that has never been signed in, which is usually a remote host.

The key covers the OpenCode Zen and OpenCode Go providers. If you point opencode at Anthropic or OpenAI directly instead, that provider reads its own variable from your environment and this file doesn't apply.

## How a token reaches a workspace

<img class="agent-float left" src="/agents/idris-south-west.png" alt="" />

Janissary reads both files once when it starts, then hands the values to each workspaced tab's processes as they launch. Nothing is copied into the workspace itself, so a token never lands in a clone you might push. Editing a token file takes effect on the next launch of Janissary, not on the next tab.

A token reaches the tab whether or not isolation is actually active on that machine. Isolation needs macOS, so a Linux host runs without it, and the credential arrives the same way either way.

## How tokens reach a remote

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

All three tokens travel to a [remote agent or harness](/user-documentation/advanced-agents/remote-agents) the same way. Janissary sends them through the encrypted SSH connection when it asks the remote for a workspace, and injects them only into that workspace's processes. None is written to the remote filesystem, so you don't need to copy any of these files to the other machine. If your project has no token, the remote falls back to the matching file in its own project.

Forwarding is what makes a remote work at all for a harness. A Linux host has no keychain for `claude`, and a host nobody has signed into has nothing for `opencode`, so without your tokens those tabs open logged out.

Both machines need a Janissary recent enough to forward the tokens. A launch against an older install stops with a message naming both protocol versions instead of opening a tab that runs but can't push or can't sign in. Update both ends together.

Only the GitHub token reports back. When a remote tab opens, a line about the token means the forwarded one isn't what's in use. Silence means yours is. The two harness tokens say nothing either way, because a harness with no credential tells you so in its own output as soon as it starts.
