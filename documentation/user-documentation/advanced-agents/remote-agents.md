# Remote agents and harnesses

<img class="agent-float" src="/agents/orhan-south-east.png" alt="" />

Add `on <address>` to any `agent` or `harness` command and the tab runs on another machine instead of yours:

```
harness claude on devbox
agent bekir on admin@devbox
harness claude as build on devbox with fix the tests
```

Janissary opens one SSH session to that host, clones a workspace there from the host's own copy of the repository, and runs the agent or harness inside it. The tab behaves like a local one in every other way: same label, same busy dot, same `send`, capture, recording, and monitoring. The one visible difference is a chip with the host name at the left of the tab's metadata row, ahead of the working directory.

The clause can appear anywhere among the other options, and it isn't case sensitive. An `on` that falls inside a `with <prompt>` clause is part of the prompt, not a clause, because the prompt is separated out before any option is read.

## Address forms

The address is a single token, `[user@]host[:path]`.

| You type | Where it runs |
| --- | --- |
| `on devbox` | `devbox`, in the first git repository found by walking up from your SSH login directory |
| `on admin@devbox` | `devbox`, signed in as `admin` |
| `on devbox:/srv/proj` | `devbox`, in `/srv/proj` |
| `on admin@devbox:~/dev/proj` | both |

Everything after the first colon is a path, never a port. A trailing `:2222` names a directory called `2222`.

The clause takes no SSH options at all. No ports, no identity files, no jump hosts. Give a host that needs any of those a `Host` alias in your `~/.ssh/config` and name the alias instead:

```
harness claude on my-devbox
```

Addresses accept letters, digits, and `. - _ / ~`, plus `@` in the host part and the one `:` separator. Anything else is refused by name rather than escaped, since an address can come from a [profile](/user-documentation/automation/profiles) on disk as well as from something you just typed:

```
Invalid remote address "dev box". Use [user@]host[:path] with letters, digits, and . - _ / ~ only.
```

An `on` with nothing after it gives you `Usage: on <[user@]host[:path]>.`

## What the remote needs

Two things, both set up ahead of time:

- `janus` on the remote account's `PATH`. Nothing is shipped over the connection, so the remote is a normal janissary install, not something Janissary uploads. Janissary runs `janus remote-serve` there through your own login shell, so a `janus` installed by a version manager such as nvm is found the same way it is when you SSH in and type the command yourself.
- A git repository with an `origin` remote at the path you named, or above your SSH login directory when you named no path.

## Sign in through the tab

<img class="agent-float left" src="/agents/malik-south-west.png" alt="" />

The tab opens right away, before anything is checked, and shows the live SSH session as its body. Whatever SSH asks for appears there: a password, a key passphrase, host key verification, a 2FA code. Answer by typing into the tab. There's no dialog and nothing is asked in the tab you launched from.

Each independent remote launch opens its own session, so a [profile](/user-documentation/automation/profiles) that opens several remote tabs asks you several times. Agents created with a remote tab's ➕ button share that tab's existing workspace and session, so they do not ask you to sign in again.

Once the far side answers, the tab stops showing raw terminal output and starts running the agent or harness. Until then the tab counts as still provisioning, so anything sent to it with `send` or by a schedule waits in the queue instead of being typed into a password prompt.

## Workspaces are always on

`on` implies a workspace. The remote side does nothing but provision a clone and run processes in it, so `harness claude -w on devbox` and `harness claude on devbox` are the same command. A remote launch turns the workspace on even if you passed `--no-workspace`.

Isolation belongs to the remote too. It needs macOS, so a Linux host runs without it, and the notice you see in the tab is that machine's rather than yours. `--offline` only means something where the remote's isolation is active.

## Push from a remote workspace

<img class="agent-float" src="/agents/fariz-south.png" alt="" />

Janissary forwards your project's GitHub token through the encrypted connection and uses it only for that remote workspace's processes, so you don't need to copy the token file to the other machine. [Tokens for agents](/user-documentation/advanced-agents/tokens) covers how to create the token and where to put it.

The tab tells you when the token in use isn't the one you forwarded. You'll see `github token: none forwarded from the initiating project, using this machine's own` when the remote fell back to its own token, and `github token: none configured on either machine, so none was injected for git push or gh` when neither had one. No line about the token means yours is what the workspace is running on.

Your Claude, OpenCode, and Gemini tokens are forwarded the same way, which is what keeps a harness signed in on a machine that can't sign itself in. A Linux host has no keychain for `claude`, and a host nobody has run `opencode auth login` on has nothing for `opencode` or for its Google provider, so without the forwarded tokens those tabs start up logged out. None of the three reports anything when it works or when it doesn't, because the harness itself says whether it's signed in.

## Find the connections

A remote tab lists two connections: `ssh:<address>` for the transport, and `terminal:<program>` for the process on the far side, so a remote claude harness shows `terminal:claude` exactly as a local one does. Both are closable on their own. Closing a shared SSH connection closes every agent and file navigator using it. See [Connections](/user-documentation/command-bar/connections).

## Browse and edit remote files

Click the 📁 button in a remote agent or harness tab to open a [file navigator](/user-documentation/tab-types/file-navigator) rooted in that tab's remote workspace. It uses the SSH connection that is already open, shows the host chip ahead of its path, and has the same search, git status, create, rename, delete, move, copy, paste, undo, and redo tools as a local tree. `files in <label>` does the same when `<label>` names a remote tab.

Open and edit remote files normally from that tree. Janissary keeps the working copy it needs locally and writes editor saves back to the remote host. If a save fails, the editor stays marked as changed and the notifications feed explains the failure. **Open externally** is unavailable for remote files because an outside application could not send its changes back.

File moves and clipboard pastes stay on one machine. Dropping between hosts is not offered; pasting onto a different host is refused without clearing your clipboard. Dragging a remote row into a command bar or editor inserts a path such as `devbox:/srv/project/src/index.ts`, so the host is never ambiguous.

## When a launch fails

The message appears in the placeholder tab, which closes a few seconds later. A failed remote launch looks the same as a failed local clone.

SSH's own text shows up verbatim when it can't connect or authentication fails, since it was already rendering in that terminal. Janissary adds these:

- `Remote path not found: <path>`
- `<path> is not a git repository.`
- `<root> has no "origin" remote.`
- `Remote janissary speaks protocol version <n>; this one speaks <m>. Update janissary so both hosts match.`

The version check is stricter than it looks, and deliberately so. It covers what the two sides put in each message, not just the shape of the messages, so an older install that would quietly drop a forwarded token is refused at the handshake rather than opening a tab that runs perfectly and can't push or can't sign in.

You'll also see a failure if `janus` isn't on the remote's `PATH`, if no git repository is found above your login directory, or if the session ends before the workspace is ready.

## Lifecycle

A remote workspace and its SSH session last until their final user closes. The launching tab, agents joined with ➕, and its file navigator can all share that session. Closing the launching tab leaves joined agents running; a navigator opened from that tab's 📁 button closes with it. If the connection itself drops or you explicitly close `ssh:<address>`, every tab and navigator using it closes. There's no reconnect and no reattach, so a new launch starts a fresh session.

The remote deletes its workspace clone when the session's last user closes, including when the connection drops, so a lost connection never leaves a clone behind. Remote files opened for viewing or editing are cached locally only for that session and cleared at startup or when its last user closes.

`janus --relaunch` doesn't bring a remote agent tab or remote file navigator back, and profiles do not restore remote navigators.

## What stays local

Screen captures, recordings, and busy detection are worked out on your machine from the terminal output streaming back, so `harness capture` writes a capture file locally and the busy dot behaves as usual. `harness transcript` is the exception. It reads the harness's own session record, which lives on the remote, so the remote reads it and sends the rendered result across.

A remote tab still can't launch its own remote tab. There is no `files on <address>` form without an existing tab on that host, and files cannot be copied between machines or handed to `open external` from a remote tree.

## Asking the remote agent

`acp <prompt>` works in a remote agent tab, and the agent runs on the remote host against that host's workspace — see [ACP agents](/user-documentation/advanced-agents/acp-agent). The `db` and `browser` commands it runs on its own still act on your machine, not the remote.

For this to work, `opencode` has to be installed and authenticated on the remote — or an OpenCode or Gemini API key configured in your local project, which is forwarded across the connection the same way the other credentials are.
