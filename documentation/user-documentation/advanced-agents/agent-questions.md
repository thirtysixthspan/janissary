# Agent questions

<img class="agent-float" src="/agents/hakim-south-east.png" alt="" />

An agent can pause what it's doing and ask you something, then wait for your answer before it goes on. You can ask the same kind of question yourself, from any tab's command line:

```
question ask "Deploy to staging first?"
question approve "Keep the existing config?" yes no
```

`question ask "<question>"` opens a panel with a text field, for a free-text answer. `question approve "<question>" <option> [<option> …]` opens a panel with one button per option, for a single choice. Quote the question; quote any option that contains spaces too.

When an agent ends its reply with one of these commands, Janissary strips the command out of the visible reply, opens the panel, and holds the agent's turn until you answer. Your answer comes back to the agent as the result of that command. A malformed command — missing quotes, no options for `approve` — returns usage text instead of opening a panel:

```
Usage: question ask "<question>"
       question approve "<question>" <option> [<option> …]
```

## Where the panel appears

The panel opens on the tab that asked the question and stays tied to that tab as you switch away and back. It doesn't block the rest of the app: it's non-modal, so you can keep typing in other tabs, switch away, or use any other control while it's still waiting for you.

<img class="agent-float left" src="/agents/fariz-south-west.png" alt="" />

Both kinds of panel — text field and option buttons — include a **Cancel** button.

## Keyboard focus

A free-text panel starts with focus on the text field. An approval panel starts with focus on **Cancel**. `Tab` and the right arrow move focus forward through the panel's buttons (each option, or **Submit**, then **Cancel**), wrapping back to the first button at the end; `Shift+Tab` and the left arrow move backward the same way. If you switch to a tab that already has a pending question, focus jumps straight to that panel's **Cancel** button, whichever kind it is.

## One question at a time per tab

A tab can only have one pending question visible. If the same tab asks a second question before the first is answered, the second one waits and only appears once you resolve the first. Different tabs can each have their own pending question at the same time, independent of one another.

Questions live only in memory for the running session — they're not saved, and a `janus --relaunch` doesn't bring back anything that was still pending.

## Notifications

If a question opens on a tab you're not currently looking at, and the [notifications](/user-documentation/tab-types/notifications) feed is open, it records `Question from <tab>` as a line you can click to jump to that tab. This one has no on/off toggle in `.janissary/config.json` — unlike the feed's other events, it always fires for a background tab. Nothing is recorded if you're already looking at the tab that asked, and, like every notification, it's dropped rather than queued if the feed is closed at the time.

## Cancelling a question

Clicking **Cancel**, closing the tab that asked, or shutting down the server all resolve a pending question the same way: the agent gets back `Question cancelled.` as the command's result. There's no other way to resolve one — no separate cancel command, no timeout, and no default answer supplied on your behalf.
