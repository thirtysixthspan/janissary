# Sleep and resume

Closing your laptop lid and reopening it picks your session up right where it left off, without you doing anything.

<img class="agent-float" src="/agents/tahir-south.png" alt="" />

Time spent asleep doesn't count against the one-second grace period a session gets after its last window disconnects, so a laptop that was asleep for hours doesn't lose a session the way one second of ordinary disconnection would. A session left idle while the machine stays awake still exits when that grace period runs out.

## Reconnecting automatically

A window that loses its connection keeps retrying on its own, with delays that grow from a quarter second up to five seconds between attempts. Bringing the window back into view, or your machine coming back online, triggers an immediate retry rather than waiting for the next scheduled one. A suspend can leave a connection looking open without ever closing it, so when the connection still looks open at that moment, a quick check confirms it's still answering. One that doesn't answer within a few seconds counts as dead and gets replaced. Every successful reconnect refreshes the window's tabs, transcripts, selections, and busy indicators.

A small status announcement appears in the top-right corner of the tab area while this happens: `Reconnecting…`, escalating to `Cannot reach session` after six failed attempts, then `Reconnected` for two seconds once the connection is back. It never covers or resizes whatever the active tab is showing. A window that stays unreachable keeps retrying and never forces a reload or starts a replacement session.

## What a gap loses

<img class="agent-float left" src="/agents/idris-south-east.png" alt="" />

Requests still outstanding when the connection closes fail and aren't retried automatically. Nothing you type while disconnected is queued for delivery once you're back. Terminal output produced during the gap isn't replayed either, so a terminal's history can show a jump even though the process behind it kept running the whole time.

## Remote sessions

A [remote agent or harness](/user-documentation/advanced-agents/remote-agents) keeps running on its host when your connection drops, and reconnecting opens a fresh SSH connection back into the same workspace and processes. Output it produces while you're disconnected is kept up to a fixed size; a long gap that produces more than that drops the oldest of it, and the tab notes that some output was dropped once you're back. A remote session that's confirmed to have stopped isn't restarted. The tab stays open, keeps its transcript, and explains what happened, such as `Remote janus on devbox terminated — create a new agent or shell to continue.` Being unreachable on its own is never treated as a stop. A plain `ssh <destination>` tab has none of this: a dropped SSH connection just closes the tab.

## Overdue scheduled commands

A [scheduled command](/user-documentation/automation/scheduling) that came due while your machine was asleep fires once you're back, and a recurring one picks its next run from the current time instead of catching up on everything it missed. A command delivered more than five seconds late shows up in [notifications](/user-documentation/tab-types/notifications) as `<command> ran <duration> late (system was asleep)` when it was already due before your last resume, or without that reason when the delay had some other cause. A remote tab that's still disconnected holds a due command until its connection is ready rather than dropping it.

## Limits

Sleep and resume only covers a session that's still running somewhere. It won't bring back a server process that was killed, and it doesn't recover anything automatically after a reboot. If your browser doesn't fire wake events for some reason, a disconnected window still catches up on its next scheduled retry.
