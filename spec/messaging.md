### `msg` / `broadcast` commands

`msg <agent> <info|request|command> <text>` sends a message to another agent. Each agent has a FIFO queue processed one message at a time:

- **info** — shown in the recipient's transcript (`● <from>: <text>`, dot and left border in the sender's color) and appended to the recipient's `context[]` state.
- **request** — the recipient displays the incoming request as `● request from <sender>: <command>` (dot and left border in the sender's color), executes it (built-ins, or a `shell`-prefixed shell command — interactive/PTY commands skipped; a bare non-built-in is reported as unknown) capturing its output rather than displaying it, and returns the output to the sender as a **response** message. A response renders as a `● <recipient>:` header followed by the output on its own lines, every line bordered in the recipient's color, and is appended to the sender's `context[]`.
- **command** — run as a raw shell command in the recipient's shell; interactive/PTY commands are skipped.

`broadcast <all|agent[,agent...]> <info|request|command> <text>` sends the same message to multiple agents at once. `all` (or `*`) targets every other agent; a comma-separated list targets a specific set. The sender is always excluded, and the result reports which recipients were reached and any unknown names. The kind accepts the same `i`/`r`/`c` aliases as `msg`.

