# Tokens for agents

Janissary reads four optional token files from a `.janissary/` directory. Each is a plain text file holding just the token value. Janissary only ever reads them, never writes to them, and a project's `.janissary/` is gitignored by default so none of them gets committed.

| File | What it gives a workspaced tab | Set it up when |
| --- | --- | --- |
| `github-token` | working `git push` and `gh` | you want to push or open pull requests from inside a workspace |
| `claude-token` | a signed-in `claude` harness | the machine running the tab has no usable keychain |
| `opencode-token` | a signed-in `opencode` harness | the machine running the tab has never run `opencode auth login` |
| `gemini-token` | a working Google provider | your harness talks to Gemini |

None of them is required. Without them, workspaces still clone, run, commit, fetch, and pull.

## Where to put a token file

You have two places to choose from, and Janissary checks them in this order:

1. `.janissary/` in the project you launched from
2. `~/.janissary/` in your home directory

Put a token in your home directory and every project on the machine gets it, which is usually what you want for a personal key you'd otherwise copy into each new checkout. Put one in a project and that project uses it instead, so a repository that needs its own scoped GitHub token can have one without disturbing anything else.

The choice is per file, not all-or-nothing. A home `claude-token` and a project `github-token` work together fine.

Emptying a project's file doesn't turn the credential off. A file with nothing in it reads the same as no file at all, so the home copy is used instead. To give one project a different credential, put a different value in its file.

## Get a GitHub token

<img class="agent-float" src="/agents/bilal-south-east.png" alt="" />

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to just the repositories the agent should reach, with **Contents: Read and write**, **Pull requests: Read and write**, and **Metadata: Read-only** permissions. Nothing broader.

Save the value to `github-token`, either in your home directory or in the project that needs it:

```
~/.janissary/
  github-token

your-project/
  .janissary/
    github-token
```

A scoped token is the one most worth keeping per project, since the repositories it reaches are a fact about that project.

A workspace rewrites its `origin` to HTTPS because the sandbox can't authenticate git over SSH, which is why this token exists at all. [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent) covers what changes once you add it, including the one extra step a codex harness needs.

## Get a Claude token

Run `claude setup-token` on a machine with a browser. It signs you in and prints a long-lived token tied to your Claude subscription. Save that value to `.janissary/claude-token`.

A workspaced `claude` harness normally signs in through the keychain of the machine it runs on, which works on macOS. Everywhere else the harness can't reach its saved credentials from inside the sandbox, so it starts up reporting itself logged out even though you're signed in outside the workspace. The token file is what closes that gap.

The token goes to every workspaced tab, not only harness tabs, so an agent whose shell runs `claude` picks it up the same way. If you already export `CLAUDE_CODE_OAUTH_TOKEN` in your own environment, that keeps working as before, and a token file takes precedence over it.

## Get an OpenCode key

Sign in at OpenCode, copy your API key, and save it to `.janissary/opencode-token`. It's a static key, so there's nothing to refresh and no expiry to plan around.

A workspaced `opencode` harness needs this file. It can't read the credentials `opencode auth login` saved on your machine, because a workspace is blocked from that file on purpose — it holds every provider key opencode has, and a disposable clone has no business reading them. That applies on your own laptop, not just on a remote host.

The key covers the OpenCode Zen and OpenCode Go providers only.

## Get a Gemini key

Create an API key in Google AI Studio and save it to `.janissary/gemini-token`. Janissary hands it to workspaced tabs as both `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` — opencode looks for the first when deciding whether the provider is set up and reads the second when it actually sends a request — so a harness pointed at a Google model works from a workspace without you exporting anything.

You need this for the same reason as the OpenCode key: a workspace can't read the credentials `opencode auth login` saved, so the key has to arrive by a route the workspace is allowed to use.

## Other providers

Anthropic and OpenAI have no token file. Set the provider's own variable in the environment you start Janissary from and it reaches the workspace untouched:

| Provider | Variable |
| --- | --- |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Google | `.janissary/gemini-token`, or `GOOGLE_GENERATIVE_AI_API_KEY` |

Google is the one to watch if you export the key yourself: `GOOGLE_API_KEY` and `GEMINI_API_KEY` are enough for opencode to list the provider as configured, but a request reads `GOOGLE_GENERATIVE_AI_API_KEY` and fails saying it's missing. Export that one, or use the token file, which sets both.

Google Vertex is the one that can't work. It authenticates with `GOOGLE_APPLICATION_CREDENTIALS`, which holds a path to a credentials file rather than a key. The variable reaches the workspace fine, so everything looks set up, but the file it points at stays blocked. Use one of the API-key providers above from a workspaced tab.

## How a token reaches a workspace

<img class="agent-float left" src="/agents/idris-south-west.png" alt="" />

Janissary reads your token files once when it starts, project first and home second, then hands the values to each workspaced tab's processes as they launch. Nothing is copied into the workspace itself, so a token never lands in a clone you might push, and a workspaced tab can't read either file directly. Editing a token file takes effect on the next launch of Janissary, not on the next tab.

A token reaches the tab whether or not isolation is actually active on that machine. Isolation needs macOS, so a Linux host runs without it, and the credential arrives the same way either way.

## How tokens reach a remote

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

All four tokens travel to a [remote agent or harness](/user-documentation/advanced-agents/remote-agents) the same way. Janissary sends them through the encrypted SSH connection when it asks the remote for a workspace, and injects them only into that workspace's processes. None is written to the remote filesystem, so you don't need to copy any of these files to the other machine. If you have no token to send, the remote falls back to its own copy, looked up in the same two places on that machine.

Forwarding is what makes a remote work at all for a harness. A Linux host has no keychain for `claude`, and a host nobody has signed into has nothing for `opencode`, so without your tokens those tabs open logged out.

Both machines need a Janissary recent enough to forward the tokens. A launch against an older install stops with a message naming both protocol versions instead of opening a tab that runs but can't push or can't sign in. Update both ends together.

Only the GitHub token reports back. When a remote tab opens, a line about the token means the forwarded one isn't what's in use. Silence means yours is. The two harness tokens say nothing either way, because a harness with no credential tells you so in its own output as soon as it starts.
