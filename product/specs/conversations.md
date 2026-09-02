# Conversations

The bundled chat view provides durable, ordinary conversations with an ACP-capable model. Conversation history is shared across project directories on the same machine.

### Command grammar

`chat` opens or focuses the singleton conversation list. `chat left` and `chat right` dock that list in the named sidebar. Running bare `chat` while the list is docked returns it to the centre.

`chat <title>` opens the conversation whose title matches case-insensitively. The docking words take precedence over conversations titled `left` or `right`. A missing match reports `No conversation matching "<title>".`

### Conversation list

The list is ordered by most recent activity. A **New conversation** entry appears above the saved rows. When there are no rows, `No conversations yet` appears as well.

The first saved row is current when the list opens. Up and Down move the highlighted current row without wrapping, pointer hover moves the highlight to that row, and Enter or a single click opens the current conversation. Opening focuses its existing conversation tab or creates one.

Deleting a row always asks for confirmation first. Confirming removes the conversation history, its private workspace, and everything inside that workspace; cancelling changes nothing.

### Conversation tabs

A new tab is titled `New conversation`. Its first submitted query supplies the permanent title: the first line, capped at 60 characters. Later queries do not rename it.

The tab opens with the most recent 20 turns. Reaching the top loads 20 older turns at a time until the full history is visible. Each turn shows the query, a sanitized Markdown response, and the harness/model pair that answered it. Responses appear progressively while the model is replying.

The header offers every model catalogued for the `claude` and `opencode` harnesses, grouped by harness. The selected pair applies to the next query. Changing it starts a fresh agent session; earlier turns keep the pair that produced them. If a saved pair is no longer catalogued, the next query uses the first available pair.

### Sessions, failures, and cancellation

Each conversation has one live ACP agent session at a time. A restarted app, cancelled reply, changed model, failed connection, or closed conversation tab ends that session. The next query starts another session and replays the 20 most recent completed turns before sending the new query.

Escape cancels a streaming reply. Cancellation discards the partial turn and writes nothing from it. A second query is refused while one is already in flight.

A failed query remains in the conversation with its error rendered in place. Rate-limit failures are identified explicitly. The failed session is forgotten so the next query reconnects and replays the stored context.

### Storage and workspace

Each conversation is stored in its own directory under the user's Janissary data directory. That directory contains the conversation record, an empty private workspace, and the workspace's private temporary directory. The directory is created only when the first query is sent, survives application restarts and project workspace sweeps, and is removed only when the conversation is deleted.

The conversation's ACP agent is tool-less. It runs with its current directory and sandbox workspace set to that conversation's private workspace, so it receives neither the project tree nor another conversation's data. Seatbelt confinement is best-effort: it applies on macOS while workspace sandboxing is enabled and available.

### Profiles

Conversation records and workspaces survive independently of profiles. Restoring a saved chat view reopens the conversation list; individual open conversation tabs are not restored, and their saved conversations remain available from the list.
