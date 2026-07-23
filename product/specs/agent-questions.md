# Agent questions

An ACP agent running in a Janissary agent tab can pause its tool loop and ask the human for an answer. The request belongs to the asking tab and does not block other tabs.

### Commands

An agent issues `question ask "<question>"` on its own final response line to request free text.

An agent issues `question approve "<question>" <option> [<option> …]` on its own final response line to request one choice from the supplied labels. The question must be quoted; option labels containing spaces must also be quoted.

Janissary removes the command from the visible agent reply, waits for the human, and returns the answer as command output to the same agent's next turn. A malformed question command returns usage text to the agent without opening a panel.

The human can issue the same two commands directly on any tab's command line, using the identical syntax. Typing `question ask` or `question approve` opens the same pending question panel, on the same tab, with the same validation and cancellation behavior described below. A malformed command typed this way returns usage text to the command line without opening a panel.

### Question panel

A pending question appears in a panel on its owning tab. The panel identifies the tab, preserves the question text verbatim, and shows either a text field with a submit control or one button per approval option. Both forms include **Cancel**.

The panel is non-modal. It does not trap global keyboard or pointer input, and the human can switch tabs or use unrelated controls while it remains pending. The panel is shown when its owning tab is active and remains associated with that tab across tab switches.

### Notifications

Registering a question while its owning tab is not focused records `Question from <tab>` in the notifications feed when that feed is open. This event has no configuration toggle. Its tab label is a link that focuses the asking tab.

No notification is added when the owning tab is already focused. As with every notification, a question raised while the notifications feed is closed is dropped rather than buffered.

### Ordering and lifetime

Each tab can expose one pending question at a time. A second request from the same tab remains queued until the first resolves, then becomes visible. Different tabs can have pending questions concurrently.

Questions are in-memory state. They are not persisted or restored by `--relaunch`.

### Cancellation

Cancellation, owning-tab closure, and server shutdown return `Question cancelled.` to the waiting agent. There is no shell command, external HTTP endpoint, timeout, or caller-supplied default.
