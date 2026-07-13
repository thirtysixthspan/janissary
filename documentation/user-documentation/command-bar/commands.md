# Application commands

These commands manage the app itself — the current tab's transcript and name, the syntax theme, and quitting. For creating tabs see [Agents](/user-documentation/getting-started/agents); for opening files and pages see [Opening files and pages](/user-documentation/tab-types/opening-files).

| Command | What it does |
|---|---|
| `help` | List the available commands and key bindings |
| `state` | Show the current agent's saved state fields (long values truncated) |
| `clear` | Empty the current tab's transcript — other tabs are unaffected |
| `rename [newname]` | Set (or, bare, clear) the tab's display alias — see [Tabs](/user-documentation/getting-started/tabs) |
| `syntax theme [name]` | Switch the editor syntax theme; bare form opens a picker |
| `notifications [left\|right]` | Open the [notifications](/user-documentation/tab-types/notifications) feed, optionally docked in a sidebar |
| `notify <message>` | Push a custom line into the [notifications](/user-documentation/tab-types/notifications) feed |
| `quit` | Exit the application, after confirmation |

## `syntax theme`

<img class="agent-float" src="/agents/hakim-south.png" alt="" />

`syntax theme <name>` sets the syntax-highlighting theme used by every open [editor tab](/user-documentation/tab-types/editor), and persists it so it survives a restart. Names match case-insensitively. An unrecognized name shows an error listing the available themes — which is also a quick way to see what's on offer. Bare `syntax theme` opens a picker overlay instead: arrows move, `Return` picks, `Escape` closes.

## `quit` and the confirmation dialog

<img class="agent-float left" src="/agents/yusuf-south-east.png" alt="" />

`quit` is the only command that exits the whole app, and it always asks first: a dialog reading "Are you sure you want to quit?" with **Quit (y)** and **Cancel (n)** buttons. **Cancel** is selected by default, so a stray `Enter` is safe. Press `y` to confirm or `n` / `Escape` to cancel; `←`/`→` move the selection. While the dialog is open it traps all other input — clicks outside it and other keys do nothing.

Don't reach for `exit` to leave the app: `exit` is an alias of `close` and closes the current *tab*. The one overlap is the last tab — closing it exits the app, so typing `close` or `exit` there shows the same confirmation dialog (see [Tabs](/user-documentation/getting-started/tabs)).

## `notifications` and `notify`

<img class="agent-float" src="/agents/fariz-south-east.png" alt="" />

`notifications` opens a single feed tab that collects background-tab events — an agent finishing, a message arriving, a scheduled command firing, an agent starting a turn. Each event type is off until you turn it on in `.janissary/config.json`. `notifications left` or `notifications right` docks the feed into a sidebar. `notify <message>` posts your own line into that feed from any tab, which always shows (even from the focused tab) as long as the feed is open. If the feed isn't open, events and `notify` messages are simply dropped — nothing is queued up. The full page is [Notifications](/user-documentation/tab-types/notifications).

## Command comments

Anything between `##` markers is stripped from a command before it runs or is saved to history:

```
git status ## check before the demo ##
## just cleaning up ## clear
```

Both run normally with the comment removed. A `##` with no closing marker comments out the rest of the line. A line that's only a comment does nothing. You'll also see the app use this itself: commands fired by the [scheduler](/user-documentation/automation/scheduling) appear in the transcript as `<command> ## scheduled ##`.
