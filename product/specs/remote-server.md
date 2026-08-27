# Remote Server

Every tab janissary opens normally runs on the machine the server itself runs on. A **remote
launch** puts an agent or a harness on another host instead: the `on <address>` clause names the
host, janissary opens one ssh session to it, and `janus remote-serve` on the far side provisions a
workspace and runs the process there. The resulting tab is deliberately indistinguishable from a
local one — same label, same tab strip, same busy dot, same capture, recording, transcript, and
monitoring behavior — except for a host chip at the left of its metadata row.

### The `on <address>` clause

`harness claude on devbox`, `agent bekir on admin@devbox`, `harness claude as build on devbox with
fix the tests`. The clause reads like the existing `as <label>` and `with <prompt>` clauses rather
than adding another flag, and it may appear anywhere among the other options. It is
case-insensitive. An `on` appearing inside a `with <prompt>` clause is prompt text, never a clause,
because the prompt is peeled off before any option is scanned.

`on` implies a workspace. The remote server's only job is to provision a clone from its own project
root, so a remote launch without one has no meaning; rather than reject `harness claude on devbox`
with an error the user can only fix one way, the clause turns the workspace on. `harness claude -w
on devbox` and `harness claude on devbox` are the same command.

### Address grammar

The address is a single token, `[user@]host[:path]`, split at the first colon.

```
on devbox                    → connect to devbox, remote root found by walking up from the ssh login directory
on admin@devbox              → connect as admin
on devbox:/srv/proj          → remote root is /srv/proj
on admin@devbox:~/dev/proj   → both
```

Everything after the first colon is a **path**, never a port: a trailing `:2222` names a directory
called `2222`. The clause accepts no ssh options at all — no ports, identity files, or jump hosts —
so a host that needs any of those is expressed as a `Host` alias in the user's `~/.ssh/config` and
named by that alias. This keeps the clause one unambiguous token.

Both halves of the address are validated against a conservative character set: letters, digits, and
`. - _ / ~` (plus `@` in the destination and the single `:` separator). Anything else — a space, a
quote, a semicolon, a backtick, `$`, `&`, `|` — is rejected by name rather than escaped, because an
address can arrive from a profile file on disk as well as from something just typed. An `on` with no
following token is a usage error.

### Bootstrap requirement

The remote must already have `janus` on its PATH. Nothing is shipped over the wire: no bundle
upload, no `npx` fetch. The remote is a peer installation, not a payload. A missing binary fails the
launch with ssh's own message in the tab's terminal.

The remote command runs through the remote user's **own interactive shell**, so that user's shell
startup file is read before `janus` is looked up. A `janus` installed by a version manager such as
nvm — whose PATH setup lives in the interactive startup file and is skipped when ssh runs a bare
command — is found for the same reason it is found when the user ssh's in and types the command by
hand. The shell is whichever one the remote account is configured with, not a fixed choice.

### Authentication

Each remote tab owns one ssh session and one `remote-serve` process. There is no multiplexing and no
shared channel, so authentication happens once per launch — and a profile of several remote tabs
raises several prompts.

The tab opens **immediately**, before anything is validated, showing the live ssh session as its
body. ssh's own prompts — password, key passphrase, host-key verification, keyboard-interactive/2FA
— render there and are answered by typing into the tab. This is the only prompt mechanism: there is
no modal, no separate dialog, and nothing is asked in the creator tab. A remote harness tab shows the
session in place of its harness terminal; a remote agent tab shows it full-screen over its
transcript, which returns once the session is established.

Once the far side announces itself the tab stops showing raw terminal output and starts running the
remote process. A remote tab whose ssh session has not yet been established is still `provisioning`,
so `send` and `schedule` deliveries queue rather than being typed into a password prompt.

### Failures

Every failure surfaces in the placeholder tab and closes it a few seconds later, exactly as a failed
local workspace clone does:

- ssh cannot connect, or authentication fails — ssh's own text, shown verbatim, since it was already
  rendering in that terminal.
- `janus` is not on the remote's PATH.
- The remote path is not a git repository (`<path> is not a git repository.`).
- The remote path does not exist (`Remote path not found: <path>`).
- No git repository is found above the ssh login directory, when the address carried no path.
- The remote repository has no `origin` remote (`<root> has no "origin" remote.`).
- The two janissary installations speak different protocol versions — the message names both
  versions and says to update janissary so the hosts match.
- The ssh session ends before the workspace is ready.

The protocol version covers what the frames carry, not only their shape. A field one end fills in
and the other is expected to honor is as much a part of the contract as a new frame type, because an
end that merely ignores it looks healthy while doing the wrong thing. Forwarding the initiating
project's GitHub token is such a field: an installation predating it accepts the provisioning
request, drops the token, provisions the workspace, and runs the harness — leaving a tab that works
in every visible way and cannot push. That installation is therefore refused at the handshake as a
version mismatch, which is the whole reason the version moved when the field was added.

The forwarded Claude token is the second such field and moved the version again, for the same
reason: an installation that honors the GitHub token but not this one provisions and runs a harness
that cannot authenticate. The forwarded OpenCode key is the third and the forwarded Gemini key the
fourth, each moving it once more. Both ends therefore have to be updated together, and a remote that
is behind is refused before a tab is provisioned rather than after the harness fails to sign in.

The provisioning frame now carries the credentials as a single map keyed by token name rather than
one named field per credential, which is what moved the version a fifth time. That bump is the one
that changes a frame's shape rather than adding to it: an installation on any earlier version finds
none of the fields it reads and would provision a workspace with no credentials whatsoever. Adding a
credential no longer touches the contract at all, so this is expected to be the last version move on
the tokens' account.

After the handshake, every frame is validated before dispatch. Process and workspace identifiers
must be nonempty strings; terminal dimensions must be positive integers; spawn modes and optional
flags must use their declared values; exit codes must be integers; transcript blocks must all be
strings; and the provisioning token map accepts only known token names with nonempty string values.
An invalid known frame is refused as `Malformed remote frame "<type>".` and an unknown frame type is
refused by name. Undeclared properties are discarded rather than forwarded to process or workspace
handlers.

### Lifecycle and cleanup

A remote tab's lifetime is its channel's lifetime. If the ssh session ends for any reason the tab
closes, the way a harness tab closes when its process exits. There is no reconnect, no resume, and no
reattach; a new launch starts a fresh session.

On the remote side the workspace clone is removed when `remote-serve` exits — including on the
hangup it receives when the channel drops — so a dropped connection never leaves a clone behind.
Closing the tab locally, or closing its `ssh:` connection, ends the session and triggers the same
cleanup.

Nothing is deleted locally when a remote tab closes: its workspace lives on the other host, so the
tab deliberately records no local workspace directory.

### What is computed where

Screen captures, asciicast recordings, and busy-status detection are computed **locally** from the
streamed terminal bytes, so `harness capture` writes a local capture file holding the remote screen
and the busy dot behaves exactly as it does for a local harness. `harness transcript` is the
exception: its source is the harness binary's own session record, which lives in the remote's dot
directory, so the remote reads it and pushes the rendered blocks across.

Isolation is the remote's own. `remote-serve` applies the same workspace sandbox
policy the local server applies, which means isolation is active when the remote is macOS and
inactive otherwise; the remote's own isolation notice — not this machine's — is what appears in the
tab. `--offline` is likewise only meaningful where the remote's sandbox is active. The local
project's scoped `.janissary/github-token`, when configured, is forwarded in the encrypted SSH
channel's provisioning frame and injected as `GH_TOKEN` only into that remote tab's workspaced
processes; it is never written to the remote filesystem. That injection is independent of the
remote's own isolation state — a remote where the sandbox is inactive, which is every non-macOS
remote, still receives the token in its workspaced processes. If the local project has no token, the
remote project's own `.janissary/github-token` remains the fallback. The initial clone uses whatever
transport the *remote* repository's `origin` already has.

The local project's `.janissary/claude-token`, `.janissary/opencode-token`, and
`.janissary/gemini-token` travel the same way, in the same map on the same frame, and are injected as
`CLAUDE_CODE_OAUTH_TOKEN`, `OPENCODE_API_KEY`, and — for the Gemini key, both variables opencode
reads — `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` into the same processes, each
with the remote project's own matching file as the same fallback. It matters most on exactly the hosts the GitHub
token's isolation-independence describes: a Keychain and the sandbox both need macOS, so on a Linux
remote the harness has no credential store to fall back on and its own credentials file is denied,
which without a forwarded token leaves it reporting itself logged out.

Unlike the GitHub token, neither harness credential carries a notice. A workspace with no GitHub
credential is invisible until a much later `git push` fails, which is the whole reason that notice
exists; a harness with no credential of its own says so in its own output as soon as it starts. Most
remote launches also have neither harness token configured on either machine and are working exactly
as intended, so a mirrored notice would speak on the ordinary case rather than warn about anything.

Which credential the remote workspace ended up with is reported the same way its isolation state is,
and for the same reason: only the remote knows, and the difference is otherwise invisible until a
much later `git push` fails. The notice is silent when the forwarded token is the one in use — the
ordinary case, with nothing to say — and speaks when it is not: once for a workspace running on the
remote project's own token because nothing was forwarded, and once for a workspace where neither
machine had a token to inject. When the remote has both an isolation notice and a credential notice,
the tab shows them on one line, separated by `; `.

### Appearance

The tab's label is derived exactly as it is today — the harness name or the agent name,
de-duplicated with `-2`, `-3`, … — and the host does not appear in the label or the tab strip. The
metadata row gains a chip showing the bare host at the **left of the row, ahead of the working
directory**, so the row reads "where, then what path there". It uses the same chip styling as the
model and effort chips, with a tooltip carrying the full destination (`Remote:
admin@devbox:/srv/proj`). The working directory shown is the remote workspace path, and the tab
carries the workspaced flag icon like any other workspaced tab.

### Connections

A remote tab lists two rows: `ssh:<address>` for the transport it runs over, and
`terminal:<program>` for the process on the far side — a remote claude harness reports
`terminal:claude`, exactly as a local one does. Both are visible and separately closable;
`connection close ssh:<id>` matches the tab's label first, then the address it was launched with,
and closes the channel (and therefore the tab).

### `janus remote-serve [<project-dir>]`

The far end. It runs attached inside an ordinary ssh session and speaks a framed protocol over that
session's stdin and stdout. It takes no instance lock, starts no HTTP server, opens no window, and
writes no log file; it is not addressable by `janus stop`, and it lives and dies with its ssh
channel.

With a directory argument it is rooted exactly there, with no upward walk. Without one it walks up
from the ssh login directory looking for a git repository. Either way the root must be a git
repository with an `origin` remote.

Its capability surface is deliberately closed: it provisions one workspace clone, runs processes
inside it, tails a harness transcript, and removes the clone on exit. It will not open tabs, serve
files, run anything outside the workspace, or accept a message outside its protocol.

### Out of scope

- Non-workspaced remote launches — `on <address>` always implies a workspace clone.
- Reconnect, resume, or reattach after a dropped channel.
- A shared or multiplexed connection per host.
- Shipping or installing janissary on the remote.
- ssh options on the clause.
- A saved directory of remotes or completion over previously used hosts.
- Remote file navigator, `open`, and editor tabs — these stay local-only.
- An alternative confinement mechanism where the remote platform has no sandbox.
- Nested remoting: a remote tab cannot itself launch `on <another-host>`.
- Restoring a remote agent tab on `--relaunch`.
