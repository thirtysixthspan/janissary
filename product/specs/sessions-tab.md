# Sessions Tab

The sessions tab answers one question the rest of the application cannot: what am I running on other
hosts right now, and what is still running out there that I am no longer attached to?

A remote session used to be invisible infrastructure tied to one tab's lifetime. Quitting the
application left a live peer on the far host with no way to find it again and nothing but its
seven-day expiry to end it. The sessions tab makes that set of sessions a thing the user can see,
park, and pick back up — the way tmux sessions are listed, detached, and reattached.

### Opening the tab

`sessions` opens the list, or focuses it when it is already open — there is only ever one. `sessions
left` and `sessions right` dock it into that sidebar, and a bare `sessions` on a docked list returns
it to the centre. Any other argument is rejected with `Usage: sessions [left|right]`. The tab is
titled **sessions**.

### What is listed

Every remote client this janissary holds, and every parked session it could come back to. That
means remote harness tabs, remote agent tabs, plain `ssh <destination>` tabs, remote file
navigators, and — for a session no longer attached — one row per process still alive on its host.

There is deliberately no row standing for a connection. A connection shared by several tabs shows
itself by grouping, not by a row of its own.

An empty list reads `No remote sessions`.

The list header is a full-width metadata bar matching agent tabs, containing only Refresh and Split controls together at the right edge. This layout applies even when Sessions is the first plugin opened.

### Row content

Five named columns — Host, Type, Tab, State, Last activity, and an unlabeled actions column — list
the bare host, what the row is running, its kind, its state, and how long ago it last changed. The
third column shows the tab's own name — a harness or agent label, `ssh`, or a navigator's abbreviated
root. The type is what the row *is*: `harness`, `agent`, `ssh`, or `navigator`, matching the tab it
opens or would open. The row's tooltip carries the full destination
and the remote workspace path, and the reason the last attempt on it failed when there was one.
Headings and entries are left-aligned and share those columns, including joined rows. The final column reserves the same width in every row, so different numbers of action buttons do not shift the headings or values.

The state is one of `provisioning` (a remote tab whose workspace clone has not landed yet), `active`,
`reconnecting` (the tabs are open, the transport is gone, and janissary is already retrying),
`detached` (parked on its host, awaiting reattachment), or `ended` (a session established to be
over).

A session the channel lifecycle ends outright leaves no row at all: its record is dropped with the
channel, so a harness the user closes reads as one ending — never as a second, detached line for a
peer that was already shut down. Only a session parked while its peer stays alive keeps a row.

Rows are ordered by most recent activity, newest first. Rows sharing a connection are indented under
the row that launched it, and a group stays together wherever its launching row sorts — so one glance
shows what a single detach would take with it.

### Actions

Every row offers what it can actually do, and nothing else. The give-and-take copy of the link
control reads Disconnect — green, because taking a session away is the deliberate, recoverable
direction — and Reconnect — red, because it reaches for a session that is not here. The other
row buttons keep their own verbs.

**Reattach** applies to a parked session, and to a live one whose transport is being retried. On a
parked session it opens one ssh connection and brings the whole peer back, opening a tab for each
process still running on it; pressing it on any row of that session brings back all of them, because
one connection serves them all. On a reconnecting session it means "try now" and collapses the
backoff wait.

Reattachment works when the remote workspace path does not exist on the local machine. The restored tabs return to the saved workspace on the remote host.

**Detach** applies to a live session and gives it up locally while deliberately leaving it running.
Closing the local tabs during that action never stops their remote processes.
A detached harness remains listed after its local tab closes. Reattaching restores the same running process and keeps its tab open; repeated detach and reattach cycles do not start replacement harnesses. A late exit from an earlier connection does not close the restored tab or remove its session row.
Once a remote agent is ready, its persistent shell keeps the session detachable even before the user runs a command.
It closes every tab and navigator riding that connection, so it asks for confirmation first, naming
what will go. It acts on the whole connection — a per-tab detach would have to keep the connection up
for the others and would mean nothing — so it sits on the launching row alone. It is unavailable
while the session is still provisioning: there is nothing to come back to yet. When the launching tab
has been closed while joined tabs keep the connection alive, the launching row cannot be presented
and the whole connection would otherwise be destructible only — so the surviving rows carry the
launching row's actions instead, and raising detach on any of them parks the shared session the same
way.

A detach is refused outright for any session that could not be listed afterwards — one still being
prepared, one the host never named, or one whose workspace has nothing running in it — and the
reason is recorded in the notifications feed rather than left as a control that does nothing. The
session stays exactly as it was: nothing is given up locally and nothing is parked on the host.

**End session** applies to a parked session and destroys it: janissary reconnects far enough to tell
the peer to stop its processes and remove its remote workspace. It asks for confirmation. A live
session carries no end button, because closing its tabs already does that.

The row stays on screen while the attempt runs, marked as ending, with its end and reattach controls
not pressable until it settles — reaching a slow or unreachable host takes minutes, and a row that
disappeared for the duration would read as an end that had already succeeded. A peer that answers —
accepting the reattach or refusing it because the session is already gone — ends the session: the
record is dropped and the row becomes ended. A connection that never gets an answer establishes
nothing: the row stays parked with the failure reported and the reattach button beside it.

**Forget** removes janissary's own record and touches nothing on the far side. It is earned rather
than always present: it appears on a parked row only after a reattach or an end has failed to reach
that host, so it cannot be the easy way past a session that is merely slow to answer. An ended row
carries it as the only thing left to do with the row.

**Close** appears where a launching row carries detach: on an ssh row, a navigator row, and any row
joined onto another row's connection. Closing an ssh row kills that tab's session; closing a joined
row releases its hold on the shared connection.

### Opening a row

One click moves the current row, a second click on the same row opens it, and Enter opens the
current row. Opening an active, reconnecting, ssh, or navigator row focuses that tab. Opening a
parked row reattaches it. Opening an ended row does nothing.

Up and Down move between rows without wrapping; Home and End jump to the ends.

### Refresh

The list keeps itself current: a session being launched, joined, released, parked, or losing its
transport updates the rows as it happens, and a session is recorded as reattachable the moment it has
a workspace with something running in it — whether or not this tab is open. The header's refresh
button is therefore for re-reading rather than for noticing, and returning to an open tab from
another is too: the tab re-reads when the user brings it back into focus. It opens no ssh connection. Reachability is learned only by pressing reattach or end, so a parked row claims
nothing about its host beyond what the record says and what the last attempt reported — a peer that
expired while janissary was closed still reads as detached until something tries it.

### What a failed attempt establishes

A refused reattach, or a recorded peer process that no longer exists, establishes that the session
is over: the row becomes ended and a notification names it. A timeout or a failed connection
establishes nothing: the row stays parked with its failure reported, the reattach button can be
pressed again, and the trash button appears beside it.

Every failed reattachment also records a notification naming the session, host, and reason, including a failure to start the connection itself. The notification remains available after the temporary connection tab closes.

A peer that accepts a reattach but reports nothing still running is told to shut down and its record
dropped, rather than being left holding a remote workspace for a week with nothing in it. A reattach
that fails or ends also lets go of what it prepared for its tabs: a restored agent binds to the
process still running on the far side when it is brought back, and that binding is dropped again once
the attempt is over — so an agent tab recreated later under the same name starts its own shell on
the connection it is actually on, never binding to a process belonging to a different session.
Closing a reattached tab before running anything releases the same binding.

### Reporting

Each action records one line in the notifications feed, so the change survives the tabs it happened
to: `<what> on <host> detached — reattach it from the sessions tab.`, `<what> on <host> reattached.`,
`<what> on <host> ended.`, and `<what> on <host> forgotten — its record was removed.` A refused
detach records its own line naming why, so an action that declines to run is never silent. A line is
attributed to the sessions tab when it is open and to the active tab otherwise, so the feed's
provenance header names the surface the change belongs to even when the action was raised from a
metadata row. See [[notifications]].

### The control on a remote tab

Every remote tab's metadata row carries the same control, right-aligned among the row's other
buttons and light on dark: detach while the
session is healthy, reattach while its transport is being retried. It is disabled while the tab is
provisioning and shows a spinner while an action is in flight. The spinner clears when the action is
answered — including when it was refused, and including when nothing answers at all — so the control
is never left reading as mid-operation on a tab that is still open. A reattach pressed on a tab whose
connection has already gone is refused with its reason recorded, like a refused detach. Pressing
detach there acts on the whole shared connection and asks the same confirmation the list does — the
one dialog, with the same keyboard behavior on both front doors: Escape cancels, `y` or an
arrow-toggle and Enter confirms, and the focus lands inside the dialog when it opens. A remote file navigator's
header keeps its host chip and gains no control, matching what its row offers.

### Scope

The list is the project's own: opening janissary on another project shows only that project's remote
sessions, which matches what a remote launch is — a clone of *this* project's origin.

The sessions tab and the connections surface stay disjoint. `connection list` and the connections
panel describe connections open now, so a parked session appears in neither. See [[connection]] and
[[remote-server]].
