### `msg` / `broadcast` commands

`msg <agent> <info|request|command> <text>` sends a message to another agent. Each agent has a FIFO queue processed one message at a time:

- **info** — shown in the recipient's transcript (`● <from>: <text>`, dot and left border in the sender's color) and appended to the recipient's `context[]` state.
- **request** — the recipient executes the command through the full dispatch pipeline (app commands, shell, ACP, browser, probabilistic routing — everything the user could type), displaying it in the recipient's transcript as if they entered it themselves, and returns the captured output to the sender as a **response** message. A response renders as a `● response from <responder>` header followed by the output on its own lines, every line bordered in the responder's color, and is appended to the sender's `context[]`.
- **command** — shown in the recipient's transcript as `● <from>: sent command: <text>` (dot and left border in the sender's color), then dispatched through the full command pipeline (same as `request`, but no response is sent back to the sender).

On the sender's side, the sent message is entered into the sender's transcript as `→ <to> (<kind>): <text>`, so the sender has a record of what they sent.

`broadcast <all|agent[,agent...]> <info|request|command> <text>` sends the same message to multiple agents at once. `all` (or `*`) targets every other agent; a comma-separated list targets a specific set. The sender is always excluded, and the result reports which recipients were reached and any unknown names. The kind accepts the same `i`/`r`/`c` aliases as `msg`.

