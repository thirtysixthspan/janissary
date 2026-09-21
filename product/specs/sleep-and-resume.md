# Sleep and resume

### Returning from sleep

Closing a laptop lid and reopening it preserves the running local session. Time spent asleep does not consume the one-second grace period after the last window disconnects. An idle session still exits when its grace period expires while the machine is awake.

The window reconnects automatically, retrying indefinitely with delays increasing from a quarter second to at most five seconds. Returning to a visible window or coming back online prompts an immediate attempt while disconnected. When the connection still appears open at that moment — a suspend can leave it looking healthy without ever closing it — a quick liveness check confirms it is still answering, and a connection that does not answer within a few seconds is treated as dead and replaced. Every reconnect refreshes the session state, including tabs, transcripts, selections, and busy flags.

### Connection status

A small announcement in the center column appears for every tab type. It reads `Reconnecting…`, escalates to `Cannot reach session` after six unsuccessful retries, and shows `Reconnected` for two seconds after recovery. It is overlaid in the column's top-right corner rather than placed above the tab's content, so appearing and disappearing never moves or resizes what the tab is showing. A session that remains unreachable leaves the window open and keeps retrying. Reconnection never forces a reload or starts a replacement session.

Requests outstanding when the local connection closes fail and are never resent. Input during a disconnected period is not queued. Terminal output produced while disconnected is not replayed, so a terminal can show a gap even though its process continued running.

### Remote work

Remote agents and harnesses launched with `on <address>` continue running on their host when the connection drops. Recovery opens a new SSH connection and attaches to the existing workspace and processes. Related tabs and file navigators remain open. A detached remote session waits up to seven days; if nobody returns, its processes and workspace are cleaned up. Output produced while detached — an agent's replies, a remote shell's output — is buffered up to a fixed size; a detachment that produces more than that drops the oldest of it and, on attachment, an agent tab's transcript notes that some output was dropped to limit memory use.

A remote session that is confirmed to have terminated is not restarted. The affected tab stays open, preserves its transcript, and explains what went. A notification reads `<what> on <host> terminated — create a new agent or shell to continue.`, where `<what>` is `Remote janus`, `Remote harness '<label>'`, or `Remote shell`. Unreachability alone is not treated as termination.

Plain `ssh <destination>` tabs keep their ordinary close-on-exit behavior: a dropped SSH connection ends the tab, without attachment.

### Overdue commands

A scheduled command that became due while asleep fires once after waking. A recurring command calculates its next run from the current time rather than replaying every missed occurrence. A command delivered more than five seconds late raises `<command> ran <duration> late (system was asleep)` when it was already overdue at the machine's last resume, or `<command> ran <duration> late` when its lateness has some other cause, including when its tab is active and notification toggles are off. A disconnected remote tab waits for its channel to be ready before a scheduled command is delivered.

### Limits

Recovery covers sleep and connection loss while the session still exists. It does not restore a killed local server or recover automatically after reboot. If browser wake events do not fire, a disconnected window recovers on its next scheduled retry.
