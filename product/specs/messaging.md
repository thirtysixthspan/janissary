### `msg` / `broadcast` commands

`msg <agent> <info|request|command> <text>` sends a message to another agent. Each agent has a FIFO queue processed one message at a time:

- **info** — shown in the recipient's transcript (`● <from>: <text>`, dot and left border in the sender's color) and appended to the recipient's `context[]` state.
- **request** — the recipient executes the command through the full dispatch pipeline (app commands, shell, ACP, browser, probabilistic routing — everything the user could type), displaying it in the recipient's transcript as if they entered it themselves, and returns the captured output to the sender as a **response** message. A response renders as a `● response from <responder>` header followed by the output on its own lines, every line bordered in the responder's color, and is appended to the sender's `context[]`.
- **command** — shown in the recipient's transcript as `● <from>: sent command: <text>` (dot and left border in the sender's color), then dispatched through the full command pipeline (same as `request`, but no response is sent back to the sender).

A messaged command is never moved into a terminal: an interactive program is refused outright with `Cannot run interactive command remotely: <cmd>`, and a program that would otherwise be detected mid-run (see `shell.md`) simply runs without taking over the tab. Both follow from the same requirement — the sender is owed captured text, and a command that took the screen has none to give.

A messaged command is classified by `resolveCommand` in `src/resolve.ts`, the same resolver the command bar uses, so it means exactly what the same text typed into the recipient's tab would mean: `!<cmd>` and `shell <cmd>` run `<cmd>` in the piped shell, a leading `/` or surrounding whitespace is ignored before the registry is consulted, and unrecognized text falls through to the same route recognition. Because a forced terminal is interactive by request, `shell --pty <cmd>` and `!!<cmd>` are refused with `Cannot run interactive command remotely: <cmd>` rather than piped. A bare `shell --pty` or `!!`, which would open the user's login shell, is refused naming that shell (`$SHELL`, or `bash` when unset). `acp` and `browser` answer a `request` directly through their own capture hook; every other built-in runs through its ordinary definition, and the response is the last transcript entry it appended (empty when it appended none).

Closing a tab releases its queue (`AgentCommunicationManager.closeTab`, called from the tab-close walk): messages still waiting for it are discarded, and a message it was handling at close no longer holds the queue. That message's shell command dies with the tab and never reports back, so without the release a later tab that reuses the same name would never receive `msg` or `broadcast` again. A completion that does arrive late from the closed tab's message is ignored, so it cannot start the next message for a newer tab of the same name while that tab's own message is still running.

On the sender's side, the sent message is entered into the sender's transcript as `→ <to> (<kind>): <text>`, so the sender has a record of what they sent.

`broadcast <all|agent[,agent...]> <info|request|command> <text>` sends the same message to multiple agents at once. `all` (or `*`) targets every other agent; a comma-separated list targets a specific set. The sender is always excluded, and the result reports which recipients were reached and any unknown names. The kind accepts the same `i`/`r`/`c` aliases as `msg`.

