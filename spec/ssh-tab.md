# SSH Tab

An **ssh tab** opens a real `ssh` session as the entire tab body — a live PTY terminal that takes
over the tab, exactly like a harness tab (see Harness Tab).

## Command

```
ssh <destination> [ssh options…]
```

- `ssh` with no destination — error: `Usage: ssh <destination> [ssh options].`
- Everything after `ssh` is otherwise passed to the real `ssh` binary verbatim — flags, `user@host`,
  ports, jump hosts, and a trailing remote command all work exactly as they would on the command
  line, since janissary never models ssh's own argument grammar.

Before the ssh tab opens, the `ssh <destination> […]` command itself is recorded in the
**creator's** transcript — the tab `ssh` was run from, not the new ssh tab (which has no
transcript of its own). This happens synchronously ahead of the PTY spawn, so the launch is
always visible even if ssh exits — and its tab closes — immediately after (e.g. an unreachable
host or a failed auth).

### Destination and label

The **destination** is the first non-option token after `ssh` (an `ssh://` scheme, if present, is
stripped) — this is the connection identity shown in the connections panel as `ssh:<destination>`.
The **label** is the destination's bare host — a leading `user@` and a trailing `:port` are
stripped — and becomes the tab's label, disambiguated with `-2`, `-3`, … if already in use, the
same way harness tab labels are (per [[tab-label-no-markers]], no `ssh:` marker on the tab itself;
connection identity lives in the connections panel instead).

```
ssh devbox                  → destination "devbox",            label "devbox"
ssh admin@10.0.0.5          → destination "admin@10.0.0.5",     label "10.0.0.5"
ssh -p 2222 -i ~/.ssh/id admin@host → destination "admin@host", label "host"
ssh ssh://root@host:2222    → destination "root@host:2222",    label "host"
```

No `as <label>` clause: anything typed after the destination is a *remote command* in ssh's own
grammar (`ssh host as label` runs `as label` on the remote host). No `-w`/`--workspace` clause
either — `-w` is a real ssh flag (tunnel device forwarding), and a remote session has no use for a
local workspace clone.

## Tab shape

An ssh tab **is** a harness-view tab (`view: 'harness'`), recognized by `harness.name === 'ssh'`.
It carries the same harness payload — `name`, `program` (`ssh`), `ptyId`, `status`, `exitCode` —
plus one extra field: **destination**, the connection identity used by the connections panel.
Because it is a harness-view tab, it inherits everything a harness tab gets for free: the full-tab
PTY layout, focus behavior, input model, tab strip, placement/grouping, and persistence rules
described in Harness Tab.

## Connections panel

Unlike an ordinary harness tab (which shows `terminal:<name>` for its PTY), an ssh tab shows
`ssh:<destination>` instead, and no `terminal:` row — its only PTY is the ssh session itself. The
panel is shown even while the ssh tab is active (harness tabs otherwise suppress the connections
list over themselves, since the terminal *is* the connection) because listing the destination is
the point.

`connection list` includes a global `ssh:<destination>` row for every open ssh tab, since ssh tabs
have no command bar of their own to run `connection list` from. `connection close ssh:<id>` closes
one: `<id>` is matched against an ssh tab's (unique) **label** first, then against its
**destination** (two `ssh devbox` tabs share destination `devbox` but have labels `devbox` /
`devbox-2`, so the label match takes priority). No match returns `No open connection ssh:<id>.`,
matching the other connection kinds' message shape. Tab-completion offers `ssh:<label>` for each
open ssh tab.

## Lifecycle

- **Created** by `ssh <destination> […]` — the command is first recorded in the creator's
  transcript, then a new tab is opened, focused, and the ssh PTY starts.
- **Running** — the ssh process receives all input; the connections panel lists `ssh:<destination>`.
- **Closed** — the tab closes as soon as the ssh process exits (logout, `exit`, connection drop,
  or the binary/host being unreachable), or via the tab strip's × / `close` command (which kills
  the PTY first), or `connection close ssh:<id>` from any tab. If the ssh tab is the last
  remaining tab, closing it quits the app (see `tabs.md`). ssh's own error output (auth failure,
  unreachable host) dies with the tab — it is not echoed back to the creator's transcript.

## Delivery

`send <ssh-tab> <text>` and `schedule … in <ssh-tab> …` deliver keystrokes to an ssh tab exactly
as they do to a harness tab — typed into the PTY as a line of input — so an agent can drive a
remote session. `send` addresses tabs by label or display title, so a renamed ssh tab stays
reachable.

## Persistence

Like harness tabs, ssh tabs are **live and in-memory**: not saved to agent state, not restored on
`--relaunch`. Each `ssh` invocation starts a fresh session.

## Regression: `shell ssh <host>`

`shell ssh <host>` (an explicit `shell`-prefixed invocation) still opens an inline terminal card in
the *current* tab's transcript instead of a dedicated tab — this plan only intercepts the bare
`ssh …` form. `ssh` also remains listed as an interactive program for shell-pipeline detection
(`git log | ssh …`-style heuristics), independent of the dedicated-tab path.
