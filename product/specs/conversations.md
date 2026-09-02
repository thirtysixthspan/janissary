# Conversations

The bundled chat view provides durable, ordinary conversations with an ACP-capable model. Conversation history is shared across project directories on the same machine.

### Command grammar

`chat` opens or focuses the singleton conversation list. `chat left` and `chat right` dock that list in the named sidebar. Running bare `chat` while the list is docked returns it to the centre.

`chat <title>` opens the conversation whose title matches case-insensitively. The docking words take precedence over conversations titled `left` or `right`. A missing match reports `No conversation matching "<title>".`

### Conversation list

The list is ordered by most recent activity. Its metadata row has no title and places an icon-only **New conversation** action with the other right-aligned tab actions. The row is formatted like the metadata row of an agent, harness, or file-navigator tab: a full-width band of muted secondary text separated from the rows below it by a rule, whose action icons carry no button chrome of their own and brighten on hover. When there are no saved rows, `No conversations yet` appears below the metadata row.

The first saved row is current when the list opens. Up and Down move the highlighted current row without wrapping, and Enter opens it. A click on an unselected row makes that row current without opening it; clicking the current row opens its conversation. Opening focuses its existing conversation tab or creates one.

Deleting a row always asks for confirmation first. Confirming removes the conversation history, its private workspace, and everything inside that workspace; cancelling changes nothing.

### Conversation tabs

A new tab is titled `New conversation`. Its first submitted query supplies the permanent title: the first line, capped at 60 characters. Later queries do not rename it.

The metadata row includes a folder button and a new-agent button. The folder opens a left-docked file navigator rooted at the conversation's private workspace, or retargets the most recently focused navigator there, while focus stays on the conversation. The new-agent button opens an ordinary agent tab in the conversation tab's group with that same workspace as both its current directory and sandbox boundary. Both controls are disabled after the conversation is deleted.

The tab opens with the most recent 20 turns and the newest turn visible. An active tab follows each newly rendered query and streamed response to the bottom. Reaching the top loads 20 older turns at a time until the full history is visible; prepending that history preserves the current viewport instead of returning to the newest turn. Each turn shows the query, a sanitized Markdown response, and the harness/model pair that answered it. Responses appear progressively while the model is replying.

The header offers every model catalogued for the `claude` and `opencode` harnesses, grouped by harness. The selected pair applies to the next query. Changing it starts a fresh agent session; earlier turns keep the pair that produced them. If a saved pair is no longer catalogued, the next query uses the first available pair.

### Sessions, failures, and cancellation

Each conversation has one live ACP agent session at a time. A restarted app, cancelled reply, changed model, failed connection, or closed conversation tab ends that session. The next query starts another session and replays the 20 most recent completed turns before sending the new query.

Escape cancels a streaming reply. Cancellation discards the partial turn and writes nothing from it. A second query is refused while one is already in flight.

A failed query remains in the conversation with its error rendered in place. Rate-limit failures are identified explicitly. The failed session is forgotten so the next query reconnects and replays the stored context.

### Storage and workspace

Each conversation is stored in its own directory under the user's Janissary data directory. That directory contains the conversation record, an empty private workspace, and the workspace's private temporary directory. The directory is created when the first query is sent or either workspace control is used. Using a workspace control before the first query also saves the otherwise-empty conversation, so its workspace remains available after a restart. The directory survives application restarts and project workspace sweeps and is removed only when the conversation is deleted.

The conversation's ACP agent is tool-less. It runs with its current directory and sandbox workspace set to that conversation's private workspace, so it receives neither the project tree nor another conversation's data. Seatbelt confinement is best-effort: it applies on macOS while workspace sandboxing is enabled and available.

### Profiles

Conversation records and workspaces survive independently of profiles. Restoring a saved chat view reopens the conversation list; individual open conversation tabs are not restored, and their saved conversations remain available from the list.
