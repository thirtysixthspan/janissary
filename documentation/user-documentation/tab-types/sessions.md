# Sessions

See every remote session this project is running or has parked, and bring one back without retyping the launch command.

```
sessions
```

## Open the list

<img class="agent-float" src="/agents/cavus-south-east.png" alt="" />

`sessions` opens the list, or focuses it if it's already open — there's only ever one. `sessions left` and `sessions right` dock it into that sidebar; a bare `sessions` on a docked list returns it to the center. A docked list stacks each session onto two lines so it reads in a narrow sidebar. Any other argument shows `Usage: sessions [left|right]`. See [Tabs](/user-documentation/getting-started/tabs) for more on docking.

## What's in the list

A row appears for every remote harness, remote agent, `ssh` tab, and remote file navigator this project has open, plus one row per process still running on a host you've detached from. There's no row for a connection by itself — tabs sharing one connection are grouped under the row that launched it, indented beneath it, so one glance shows what a single detach would take with it. Rows sort by most recent activity, newest first.

An empty list reads `No remote sessions`.

## Row columns

Each row shows:

- **Host** — the bare hostname
- **Type** — `harness`, `agent`, `ssh`, or `navigator`
- **Tab** — the tab's own name
- **State** — see below
- **Last activity** — how long ago the row last changed

Hover a row to see its full destination, its remote workspace path, and the reason a previous attempt on it failed, if there was one.

## States

<img class="agent-float left" src="/agents/dogan-south.png" alt="" />

The **State** column shows a plug icon ahead of the state's name, colored the same way every other surface in the app marks a connection: green while it's up, blue while it's parked on its host, red once it's over.

- `provisioning` — a remote tab whose workspace clone hasn't landed yet
- `active` — connected and running
- `reconnecting` — the tab is open, the transport dropped, and Janissary is already retrying
- `detached` — parked on its host, waiting to be attached
- `terminated` — the session is over

## Actions

Every row shows only the actions it can actually do.

- **Attach** brings a parked session back, opening a tab for every process still running on it. On a reconnecting row it skips the retry wait and tries now.
- **Detach** gives up the local tabs for a live session while leaving it running on its host. It asks you to confirm, naming the host; closing the local tabs never stops the remote processes, and attaching later restores the same running process rather than starting a new one.
- **Terminate** stops a parked session for good: Janissary reconnects long enough to tell the peer to stop its processes and remove its remote workspace, then asks you to confirm. Terminating a live session's launching row stops the peer and closes every tab sharing it.
- **Forget** removes Janissary's own record without touching anything on the far side. It only appears once an attach or a terminate has already failed to reach that host, or on a row that's already terminated.
- **Close** appears on an `ssh` row, a navigator row, or any row joined onto another row's connection. It closes that tab without touching the connection's launching row.

## Open a row

Click a row once to select it, click again — or press `Enter` — to open it. `↑` and `↓` move the selection without wrapping; `Home` and `End` jump to the ends. Opening an active, reconnecting, `ssh`, or navigator row focuses its tab. Opening a detached row attaches it. Opening a terminated row does nothing.

## Keeping the list current

<img class="agent-float" src="/agents/ekrem-south-west.png" alt="" />

The list updates itself as sessions launch, join, detach, or lose their connection, whether or not this tab is open. Opening an `ssh` tab from another tab adds its row straight away, and closing that tab removes the row — which is what a docked list relies on, since it never leaves and returns to focus. The header's refresh button re-reads the list rather than waiting for something to change, and so does returning to this tab from another one. When docked, Refresh shares one metadata bar with the control that moves the list to the other sidebar. Refreshing never opens a connection on its own — reachability is only learned by pressing **Attach** or **Terminate**, so a parked row can go stale: a peer that expired while Janissary was closed still reads `detached` until something tries it.

## What a failed attach leaves behind

Not every failed attach means the same thing, and the row tells you which kind you got.

- **The session is over.** A host that refuses the attach, or a peer process that turns out to be gone, settles the question for good: the row becomes `terminated`, and a notification names what ended and why. A **Forget** button appears once the host could not be reached, so you can clear the record.
- **Nothing was learned.** A timeout or a failed connection settles nothing. The row stays parked, **Attach** is still there to try again, and the trash button appears beside it. The host may be asleep or merely slow, so the session is exactly where you left it.

Either way a notification names the session, the host, and the reason, and it stays in the feed after the temporary connection tab it was raised in has closed.

A host that accepts the attach but then reports no processes, or never answers at all once it has, is shut down and its record dropped rather than left holding a remote workspace with nothing in it. When an attempt ends, anything it prepared for its tabs is released too, so an agent tab you later open under the same name starts its own shell rather than binding to a process left over from a different session.

## Reporting

Each action posts one line to [Notifications](/user-documentation/tab-types/notifications): `<what> on <host> detached.`, `<what> on <host> attached.`, `<what> on <host> terminated.`, and `<what> on <host> forgotten — its record was removed.` A refused action — one that can't run, such as detaching a row that's still provisioning — posts its own line explaining why, so it's never silent. The line is attributed to this tab when the list is open, and to whichever tab is active otherwise, so the feed's header names the surface the change belongs to even when you raised it from a remote tab's metadata row.

## The control on a remote tab

Every remote tab's metadata row carries the same plug icon and the same **Detach**/**Attach** control the sessions list uses, so you don't have to switch tabs to park or restore a session. It's disabled while the tab is provisioning and shows a spinner while an action is in flight.

## Scope

The list is specific to the project you have open — launching a remote session from a different project shows only that project's sessions. It's also separate from the connections surface: `connection list` and the [connections](/user-documentation/command-bar/connections) panel describe connections that are open right now, so a parked session shows up in neither. See [Remote agents and harnesses](/user-documentation/advanced-agents/remote-agents) for how a remote session is created in the first place.
