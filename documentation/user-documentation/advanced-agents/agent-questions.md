# Agent questions

<img class="agent-float" src="/agents/hamza-south-west.png" alt="" />

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

The panel opens on the tab that asked the question and stays tied to that tab as you switch away and back. Its title names the asking tab, such as `Question from bilal`, and the question appears under it word for word. It doesn't block the rest of the app: it's non-modal, so you can keep typing in other tabs, switch away, or use any other control while it's still waiting for you.

<img class="agent-float left" src="/agents/mahir-south-east.png" alt="" />

Both kinds of panel — text field and option buttons — include a **Cancel** button.

## Keyboard focus

A free-text panel starts with focus on the text field. An approval panel starts with focus on **Cancel**. `Tab` and the right arrow move focus forward through the panel's buttons (each option, or **Submit**, then **Cancel**), wrapping back to the first button at the end; `Shift+Tab` and the left arrow move backward the same way. In the text field, `Shift+Tab` jumps to **Cancel**. If you switch to a tab that already has a pending question, focus jumps straight to that panel's **Cancel** button, whichever kind it is.

## One question at a time per tab

A tab can only have one pending question visible. If the same tab asks a second question before the first is answered, the second one waits and only appears once you resolve the first. Different tabs can each have their own pending question at the same time, independent of one another.

Questions live only in memory for the running session — they're not saved, and a new launch doesn't bring back anything that was still pending.

## Notifications

If a question opens while you're working in a different tab, Janissary records `Question from <tab>` in the [notifications](/user-documentation/tab-types/notifications) queue. The name is the one the asking tab shows in the tab strip, and clicking it in the feed takes you to that tab. Nothing is recorded if you're already looking at the tab that asked. A question that waited behind another is checked the same way when it comes up.

When no feed is on screen, the line appears as a short toast instead. Three notifications inside ten seconds dock the feed on the right.

You can't switch this line off. The background events have their own toggles under `notifications.events`, but a question doesn't. The desktop banner and the sound are separate, and you can change them. By default a question raises a banner and plays the warning sound. To quiet both, set the `question` entry in `.janissary/config.json`:

```json
{
  "notifications": {
    "alerts": {
      "question": { "desktop": false, "sound": "none" }
    }
  }
}
```

The `osNotifications` and `terminalBell` master switches still apply. [Desktop banners and bell sounds](/user-documentation/tab-types/notifications#desktop-banners-and-bell-sounds) covers the choices.

## Cancelling a question

<img class="agent-float" src="/agents/ahmed-south.png" alt="" />

Clicking **Cancel**, closing the tab that asked, or shutting down the server all resolve a pending question the same way: the agent gets back `Question cancelled.` as the command's result.

Resetting the tab's [ACP connection](/user-documentation/advanced-agents/acp-agent) with `acp reset` cancels questions the same way. It cancels the questions the interrupted request asked, including one waiting behind another, and leaves questions from other requests pending. There's no other way to resolve a question: no separate cancel command, no timeout, and no default answer supplied on your behalf.
