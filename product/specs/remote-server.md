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

Each independent remote launch opens one ssh session and one `remote-serve` process, so
authentication happens once for that launch. Tabs created from its metadata-row ➕ button and a file
navigator opened over that workspace join the existing channel without another prompt. Separate
`on <address>` launches remain separate sessions even when their addresses match, and a profile of
several independent remote tabs still raises several prompts.

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

Remote filesystem sessions and the per-spawn agent name extend the contract again, moving
`REMOTE_PROTOCOL_VERSION` to 7. A version-6 remote would ignore navigator requests and stamp a
joined process with the provisioning tab's identity, so it is refused during the handshake before
either behavior can fail silently.

Hosting a remote agent tab's ACP agent moves it to 8, and this bump adds frame types rather than
fields: prompts and reply chunks now cross the channel in both directions. An installation predating
them recognizes none of them and would refuse each one while the local tab sat waiting — a tab that
accepts prompts and answers nothing, which is exactly the failure this check exists to prevent. Both
ends must therefore be updated together, and a stale remote is refused at the handshake before any
tab is provisioned.

Forwarding the launching user's git identity moves it again, and is the quietest failure of the set:
an installation that does not know the field provisions a workspace that looks entirely healthy and
attributes every commit made in it to whatever account the ssh destination resolved to — the exact
bug the field exists to fix, still present and now harder to notice. It is therefore refused at the
handshake like every other field one end fills in and the other must honor.

The end-to-end browser moves it once more, carrying two changes at once. A launch frame now says
whether the tab was started with `-b`/`--browser`, and the remote acts on that by starting its own
protocol guard, its own confined browser, and its own scratch directory on its own host — a fact it
acts on rather than an endpoint computed here and shipped over, since the endpoint names ports on
the machine the browser actually runs on. In the other direction a new frame reports that the
remote's browser is gone, which the local side surfaces the same way a local browser's death is
surfaced — a notifications line and a band on the tab above its terminal — named against the tab that
owns that session rather than the channel, since joined tabs share one. That frame carries the
message the remote composed, the confined browser's own output included: only that host saw it, and
the tab that needs it is on this side of the channel. The message is optional, and a frame without
one is reported as `e2e browser stopped on the remote host` and nothing more. A remote session that
cannot be started at all releases the browser it
had already started for it on that host, so a failed spawn leaves nothing running there either. An
installation predating the flag ignores it and spawns the harness
with no browser variables at all, leaving a tab that comes up looking healthy in which every attempt
to connect to a browser fails with nothing to point at — so a stale remote is refused at the
handshake, as with every other field of this kind.

Attachment moves it to 14. The handshake line now carries an optional session id, and the frame
union gains `attach` and `attach-result` so a local side that lost its transport can find the
same far-side session again over a fresh ssh connection. A version-13 peer neither publishes a
session id nor answers an attach request, so it would receive a frame it refuses as unknown and
sit unreachable rather than falling back to a fresh launch — the mismatch is therefore refused at
the handshake, as with every other version bump.

Asking a peer what is still running in its workspace moves it to 15. A query frame carries no
payload — there is one workspace per peer, so the question has a single answer — and the reply names
one entry per live process with its spawn id, the program, how it was started, and the harness or
agent name it belongs to. It is what turns an accepted attach into tabs: a janissary restarted
since the launch remembers what it started, and only the far side knows what survived. A version-14
peer recognizes neither frame and is refused at the handshake like any other mismatch. An
empty reply is a real answer rather than a failure: it says the peer is holding a workspace with
nothing in it, which is the one case janissary ends rather than attaches.

Restoring retained display and transcript history moves the protocol to 16. Reopening detached tabs requests their earlier transcript history; automatic connection recovery receives only transcript blocks missed during disconnection. Both redraw retained terminal output before new output arrives. Sessions started under an older remote version have no retained display history to restore, even if the installation is upgraded while they are detached.

Retaining what was sent to an agent tab's shell moves the protocol to 17. An agent shell runs without a terminal attached, so nothing sent to it is echoed back and its retained output alone says nothing about what produced it. A peer now also retains the commands it was sent for such a shell and replays the two together, in the order it saw them, when an attach is rebuilding tabs — so a restored transcript reads as commands beside their output. Retained commands are replayed only to rebuilt tabs: an automatic reconnect delivers into tabs that are already open, possibly mid-command, where replaying the commands would be mistaken for their output ending. Nothing is retained separately for a harness, whose terminal echoes what is typed into the output it already keeps. A version-16 peer retains no commands and would answer an attach with output alone, so it is refused at the handshake like any other mismatch.

The handshake check is narrower for an attach than for a launch. An attach is answered by the
freshly started remote server that then relays into the parked peer, so the version it announces is
whatever is installed on that host now — not the version of the peer waiting behind it. A session
parked while the remote installation was upgraded therefore passes the handshake and is then refused
by name by the older peer. The query is bounded rather than open-ended so that case settles: no
answer within the wait ends the accepted session, closes its placeholder tab, and shuts down the
remote workspace rather than leaving an uninspectable peer behind.

Output the far side prints outside the protocol does not end the session. The remote's own error
reporting shares the connection the frames travel on, so a line that is not a frame at all is treated
as terminal output from that host and ignored, and the frames on either side of it are handled
normally. Only a frame the contract does not admit is a fault. Closing a remote tab therefore still
stops its remote work and removes its workspace when the far side has printed something of its own —
which it previously did not, because the stray line ended the connection before the instruction to
stop could reach the peer.

After the handshake, every frame is validated before dispatch. Process, workspace, and ACP session
identifiers must be nonempty strings; terminal dimensions must be positive integers; spawn modes and
optional flags must use their declared values; exit codes must be integers; transcript blocks must
all be strings; and the provisioning token map accepts only known token names with nonempty string
values, as does the git identity record beside it — an unknown key or an empty value in either is a
mismatched sender rather than a field to quietly drop. Filesystem frames additionally require nonempty session and request ids, an operation from
the declared closed set, and the exact argument shape for that operation; paths and history entries
are validated before the workspace holder sees them. An ACP frame's agent command must be a nonempty
string, its argument list an array of strings (possibly empty), and its environment overrides a plain
object of string values — an array or a null is refused. A reply chunk may be empty, since an agent
can legitimately stream one; a stop reason and an error message may not. An error frame's fatal flag
is required rather than optional, because an absent flag would default a dead session to recoverable.
A browser-exit frame's message is optional but, when present, must be a nonempty string; it carries
newlines, which JSON escaping keeps from being read as the end of a frame. A session-state reply
must carry an array of process entries, each with a nonempty spawn id and program and a declared
mode; one malformed entry makes the whole reply malformed rather than shortening the list, because a
short list is indistinguishable from a process that exited and an empty one ends the session. A
gate-event or capture-reply frame's `capturedAt` must be an integer within the range a timestamp can
represent; an out-of-range or fractional value is refused rather than accepted and later failing when
it is turned into a capture filename.
An invalid known frame is refused as `Malformed remote frame "<type>".` and an unknown frame type is
refused by name. Undeclared properties are discarded rather than forwarded to process, workspace, or
ACP handlers.

An ACP-level failure is not a channel-level fault. An agent that fails to spawn or errors mid-prompt
is reported on its own error frame and routed to the session that owns it; only a malformed or
unknown frame interrupts the channel. An established session then attempts to attach.

### Lifecycle and cleanup

A remote channel's lifetime is its last user's lifetime. The launching tab, every agent joined from
it through ➕, and each navigator using its workspace hold a reference. Closing one tab releases its
reference without closing the surviving tabs or ending their ssh session. A transport drop keeps those tabs, their file navigators, and their cached workspace files in place. Janissary opens a new SSH connection and attaches to the existing peer, workspace, and processes. An unreachable peer is retried with bounded delays until it becomes reachable or is confirmed to have terminated.

Reusing the launching tab's name for a new launch does not let the earlier session's readiness, errors, or recovery close or change the new session.

On the remote side a dropped connection leaves running work intact for up to seven days. Attachment cancels that expiry. Expiry or an explicit termination of the peer stops its processes and removes the workspace. Closing local tabs releases their remote resources, and when that closes the channel's last reference, janissary tells the peer to shut down immediately rather than leaving it to the seven-day wait. This still completes when the SSH transport is already closing. The wait exists only for a connection that is lost rather than deliberately terminated.

Detaching and attaching an agent preserves its persistent shell and workspace across repeated reconnects. An earlier connection's delayed exit does not close the restored agent, and input or cleanup arriving after a terminal has ended is ignored.

Closing the final remote harness tab stops its harness and removes the remote workspace before the session is left behind. Terminal cleanup keeps the connection available for remote teardown, including when the application quits, and gives shutdown frames a short bounded drain before closing SSH. That drain is what delivers those frames, so nothing else takes the connection down while it runs: closing the tabs of a session that is already ending leaves the connection to the teardown that is ending it. If a joined tab still uses the workspace, closing the launching harness leaves that tab connected until its own final release.

A refused attachment for a missing session, a recorded peer process that no longer exists, or an explicit remote shell or harness exit establishes termination. A timeout or failed connection alone does not. Terminated tabs stay open with their transcripts and an explanation, and a `remote-session-terminated` notification names what went: `<what> on <host> terminated — create a new agent or shell to continue.` Nothing relaunches automatically. Explicitly terminating the shared remote connection is the one termination that reads differently: it ends recovery, shuts the peer down, and closes every tab and navigator holding the channel rather than leaving them open, and it records no notification, because the termination was the user's own instruction rather than news about the session.

Plain `ssh <destination>` tabs retain their existing close-on-exit behavior and do not use this recovery.

A session can also be parked deliberately. Detaching one closes every tab and navigator holding its
channel and drops the transport without telling the peer anything, so the far side runs the same
path a lost connection produces and starts its seven-day wait with its processes still running.
An agent tab's persistent shell is one of those processes: it outlives the transport it was reached
through rather than ending with it, so a parked session still holds it when the attachment asks
what survived. Ending such a shell stops whatever it was running too, so nothing is left behind on
the host when the session is shut down.
Detaching is refused while a session is still provisioning: there is nothing to come back to yet.
Janissary records what it launched — the session id, the address, the workspace, and each live
process with its own label — in the project's own state directory, so a peer stays findable after the
application has been closed and reopened. That record outlives an ordinary start rather than being
swept with the rest of the state directory, and a record older than the seven-day wait is dropped
when it is read, since it describes a peer that cannot still exist.

Attaching a parked session opens one ssh connection and asks the peer to take it back. The
recorded launching tab is created first, so ssh's own password, passphrase, and host-key prompts
render there, and the remaining tabs are created once the peer has accepted and said what is still
running. Each attached tab takes its recorded label back, de-duplicated if something else has
claimed it meanwhile. Remote file navigators are not restored. A peer that comes back holding
nothing is told to shut down and its record dropped, rather than being left to hold a remote
workspace for a week with nothing in it. Output the peer replays before its tabs exist is held and
delivered to each tab as it is created, in the order the peer produced it, bounded by the same limit
the peer's own buffer uses; an overflow is reported with the existing truncated-replay line. The hold
lasts only for the attach that needs it — once its tabs are built the connection is ordinary, and
output arriving for a process no tab is listening to is dropped rather than collected for a later
attach that is not coming.

Attached harnesses redraw their retained terminal history immediately, including output from before detachment and while disconnected, without starting a replacement harness. Repeated reconnects replace the displayed terminal history rather than appending duplicate copies. The restored display is also available to captures and monitoring. Terminal and transcript histories have separate bounded retention; older text may be trimmed, and a trimmed terminal replay includes an earlier-history notice. A quiet terminal's retained display is not evicted by transcript activity. A rebuilt harness transcript receives its retained blocks once, while an automatic reconnect adds only missed blocks to the transcript already open.

Every surviving agent, including one joined to another tab's remote workspace, opens in a new agent tab when its session is attached. Its retained shell history appears in the scrollable transcript immediately, including work done while detached, without requiring a command first, and reads the way the live tab read: each retained command appears as its own transcript entry with the output it produced, in the order they ran, and the shell's internal sentinel lines and its working-directory bookkeeping are left out exactly as live command execution leaves them out. Output whose command is no longer retained — the oldest history, trimmed to keep retention bounded — still appears, as an entry with no command above it, and a command whose output never arrived appears with none below it. If the original label is occupied, the restored history belongs to the newly named tab. Subsequent idle output appears as it arrives and follows the transcript retention limit. Restored history does not become part of the next command's output, and that command's output appears only once.

A session can be terminated for good from its parked state: janissary reconnects far enough to tell the
peer to shut down, which stops its processes and removes its remote workspace. Forgetting a parked
session removes janissary's own record and touches nothing on the far side.

When the application itself quits, each remote process, ACP session, and navigator session is told
to stop before the channel carrying that instruction is closed. Closing the channel first would
leave those instructions undeliverable and the far-side processes running until the detached peer expires.

Nothing from the remote workspace is deleted locally when a remote tab closes. Files opened from a
remote navigator are materialized in the local `.janissary/remote-files/` cache; that cache is
cleared at launch and when the channel's last reference is released.

### What is computed where

A remote harness tab's permission-gate detection, auto-approve keystroke injection, and busy/ready
status are computed **server-side**, inside `janus remote-serve` — not locally from the streamed
terminal bytes. This is what lets all three keep working while the tab is detached (see [[harness]]
and "Detached-session auto-accept, notifications, and captures" below); the local
side is a consumer of what the remote reports, live while attached and replayed on the next attach
when it wasn't. Asciicast recordings, by contrast, are still computed **locally** from the streamed
bytes, exactly as for a local harness — a detached remote harness produces no recording for the gap,
since there is no local process to write one. `harness transcript` is the other exception: its source
is the harness binary's own session record, which lives in the remote's dot directory, so the remote
reads it and pushes the rendered blocks across.

#### Detached-session auto-accept, notifications, and captures

Auto-accept for a remote harness tab keeps clearing its own permission prompts while the session is
detached or reconnecting, exactly as it does while attached — this is not a separate opt-in, just the
existing auto-accept toggle continuing to work without a local client watching. A stand-down, where
auto-accept cannot clear a prompt, behaves the same way whether attached or not.

Notifications an auto-approval or stand-down would have raised are queued while detached and replayed
into the notifications tab on the next attach, in their original chronological order and timestamped
at when they actually happened rather than at reattach time. A replayed notification looks exactly
like a live one — no marking, grouping, or separate section sets it apart, and the Sessions tab gains
no badge or indicator for a session that had activity while detached.

Screen captures continue too: `harness capture <name>` works against a detached or reconnecting
session on demand, and one capture is automatically retained per detected permission gate during the
detached window (not every background poll). Captures land in `.janissary/captures/` the same way a
local harness's do; there is no separate browsing UI for captures taken while detached. Queued
notifications and captures taken during a detached window do not survive the session's own expiry or
an explicit Terminate — they are discarded with the session, same as everything else about it.

A detached capture starts a separate, non-interactive SSH query with a bounded deadline. Its relay
sends `shutdown` after it answers and drains that frame before closing, so the relay exits while the
queried parked peer keeps its socket and original expiry. Authentication, protocol, and timeout
failures return to the requesting transcript instead of leaving a hidden query transport running.
Each capture request carries a correlation id, so concurrent requests for the same process settle
their own replies. Losing a live transport settles its pending captures before reconnecting; a later
reply from the lost transport cannot be delivered on the replacement connection.
The remote process state also carries each harness's auto-approve setting so a detached Attach rebuilds
the local metadata with the policy the far-side detector is still applying.
Busy-transition frames are emitted only when either the busy or unread value changes; an attach still
receives the current busy snapshot once per running process, carrying its real unread state rather
than always clearing it, and the far side's own duplicate-suppression is realigned to that snapshot so
a later change back to the pre-attach state is not mistaken for a repeat and dropped.

The file navigator's tree state, expanded rows, selection, undo/redo history, and rendering remain
local. Directory listings, row stats, watches, search candidates, git metadata, file reads and
writes, and every mutation execute on the remote against the provisioned workspace. Every accepted
path is resolved within that workspace; an escaping path is refused. Remote file content travels to
the local cache for ordinary openers, and editor saves travel back over the same channel.

An operation that can report per-path failure — a write, a move, a rename, a delete, a paste, an
undo or redo replay, singly or in batch — reports it that way whatever went wrong, including a
connection that ended before the reply arrived and an error the remote replied with. The user sees
the same per-path outcome a local tree gives for the same action, rather than the operation failing
silently as a transport error with nothing to show. An operation that returns data with nowhere to
put a reason — a listing, stats, a watch, git metadata, a pull, a search, a file read — fails
outright instead, since there is no result for it to report into.

A reply lost to a dropped connection is reported as failed, and nothing is retried. Whether the
remote had already carried out the work before the connection ended cannot be known from the local
side, and repeating a mutation that may have run would be worse than reporting one that may have
succeeded.

A remote agent tab's `acp` agent is a further exception, and it splits three ways. The **agent
process** runs on the remote, in the workspace clone, so it sees the files the tab is working on; the
remote hosts the ACP client too, so what crosses the channel is prompt text and reply chunks rather
than JSON-RPC. The **autonomous tool loop** stays local — a remote agent's `db`, `browser`, and
`question` commands execute on the machine janissary is running on, against local files and a local
browser, not the remote workspace's. And **which agent and model run** is decided locally and sent
across on the frame that opens the session, so one definition holds and the two installations cannot
silently disagree about the model. See [[acp]].

Isolation is the remote's own. `remote-serve` applies the same workspace sandbox
policy the local server applies, which means isolation is active when the remote is macOS and
inactive otherwise; the remote's own isolation notice — not this machine's — is what appears in the
tab. `--offline` is likewise only meaningful where the remote's sandbox is active. The local
project's scoped `.janissary/github-token`, when configured, is forwarded in the encrypted SSH
channel's provisioning frame and injected as `GH_TOKEN` only into that remote tab's workspaced
processes; it is never written to the remote filesystem. That injection is independent of the
remote's own isolation state — a remote where the sandbox is inactive, which is every non-macOS
remote, still receives the token in its workspaced processes. If the local project has no token, the
remote's own `github-token` remains the fallback, resolved on that machine from its project's
`.janissary/` and then its home `~/.janissary/` (see [[workspaced-agent]]). The initial clone uses whatever
transport the *remote* repository's `origin` already has.

The local project's `.janissary/claude-token`, `.janissary/opencode-token`, and
`.janissary/gemini-token` travel the same way, in the same map on the same frame, and are injected as
`CLAUDE_CODE_OAUTH_TOKEN`, `OPENCODE_API_KEY`, and — for the Gemini key, both variables opencode
reads — `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` into the same processes, each
with the remote's own matching file as the same fallback, resolved the same two ways. It matters most on exactly the hosts the GitHub
token's isolation-independence describes: a Keychain and the sandbox both need macOS, so on a Linux
remote the harness has no credential store to fall back on and its own credentials file is denied,
which without a forwarded token leaves it reporting itself logged out.

The git name and email of the user who opened janissary ride on the same provisioning frame, and are
injected as `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` and `GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` into
the same workspaced processes, on the same isolation-independent terms. They are what a commit made
inside a remote workspace is attributed to. Without them the workspace inherits the remote account's
own git config, so an agent's commits are signed by the ssh destination rather than by the person who
asked for them — or fail outright with git's "Please tell me who you are" where that account has no
identity configured at all. A forwarded identity replaces the remote machine's own whole rather than
per field: a name from one machine paired with an email from the other belongs to nobody. Where
nothing is forwarded, the remote project's own git config stays the fallback, exactly as it was.
See [[sandbox]].

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
admin@devbox:/srv/proj`). The working directory shown is the remote workspace path, prefixed with
the workspace symbol so the clone reads as `$workspace/<name>` (with anything inside it as
`$workspace/<name>/<rest>`), since the far host's own path has no meaning to local `$root` abbreviation —
and the tab carries the workspaced flag icon like any other workspaced tab.

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
inside it, drives one ACP agent per tab sharing its channel, tails a harness transcript, reads and watches files inside
that workspace, applies the navigator's filesystem mutations there, and removes the clone on exit. It
will not open tabs, serve paths outside the provisioned workspace, run anything outside that
workspace, or accept a message outside its protocol. The ACP agent is killed before the clone is
removed, so the clone is never taken out from under a live agent, and every one of them is killed —
a shared channel's server holds one agent per tab using it.

### Out of scope

- Non-workspaced remote launches — `on <address>` always implies a workspace clone.
- Multiplexing independent workspaces or independent `on <address>` launches onto one connection.
- Shipping or installing janissary on the remote.
- ssh options on the clause.
- A saved directory of remotes or completion over previously used hosts.
- `files on <address>` without an existing remote agent or harness tab.
- Cross-host file transfer, remote `open external`, and plugin-contributed selection actions in a
  remote tree.
- An alternative confinement mechanism where the remote platform has no sandbox.
- Nested remoting: a remote tab cannot itself launch `on <another-host>`.
- Restoring a remote file navigator through a profile, an attach, or `--relaunch`.
- Probing hosts on janissary's own initiative: nothing opens an ssh connection except a pressed
  attach, a pressed end, or a `--relaunch` restore.
- Arbitrating two janissary instances attaching one peer — last attach wins, and the loser enters
  its own reconnect backoff.
- `acp` in a remote **harness** tab — it is already driving its own agent binary in a terminal.
- Running an ACP agent's `db`, `browser`, and `question` commands on the remote host; the tool loop
  stays local.
- More than one ACP session per remote tab, and multiplexing one remote agent across tabs.
