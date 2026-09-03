# Conversations

The bundled conversations view provides durable, ordinary conversations with an ACP-capable model. Conversation history is shared across project directories on the same machine.

### Command grammar

`conversations` opens or focuses the singleton conversation list. `conversations left` and `conversations right` dock that list in the named sidebar. Running bare `conversations` while the list is docked returns it to the centre.

`conversations <title>` opens the conversation whose title matches case-insensitively. The docking words take precedence over conversations titled `left` or `right`. A missing match reports `No conversation matching "<title>".`

### Conversation list

The list is ordered by most recent activity. Its metadata row has no title and places an icon-only **New conversation** action with the other right-aligned tab actions. The row is formatted like the metadata row of an agent, harness, or file-navigator tab: a full-width band of muted secondary text separated from the rows below it by a rule, whose action icons carry no button chrome of their own and brighten on hover. When there are no saved rows, `No conversations yet` appears below the metadata row.

The first saved row is current when the list opens. The current row is highlighted by a marker along its leading edge that remains distinguishable while the pointer hovers another row. Up and Down move the current row without wrapping, Home and End move it to the ends, and Enter opens it. Cmd+N, or Ctrl+N on non-macOS platforms, creates a conversation and opens its `New conversation` tab.

Opening with the mouse always takes two clicks on the same row: a single click only moves the current row there, and the click after it opens that conversation. This holds for the row that is current when the list opens and for a row the arrow keys moved to, and clicking away to another row starts the count again. Opening focuses the conversation's existing tab or creates one.

Deleting a row always asks for confirmation first. Confirming removes the conversation history, its private workspace, and everything inside that workspace; cancelling changes nothing.

### Conversation tabs

A new tab is titled `New conversation`. Its first submitted query supplies the title: the first line, capped at 60 characters. Later queries do not rename it.

Double-clicking the title in the metadata row renames the conversation, the same interaction that renames a tab: an edit field replaces the name with its text selected, Enter or a click away commits, Escape cancels. A committed name is trimmed and capped at the same 60 characters, and committing a blank one changes nothing. The new name reaches the tab, the metadata row, and the conversation list together, because all three read the conversation's one name.

A conversation the user has named keeps that name: the first query names only a conversation still called `New conversation`, so renaming a new conversation before asking anything is not undone a moment later. Cancelling a reply that named the conversation gives `New conversation` back, unless the conversation was renamed while that reply was streaming — a cancel undoes its own naming and never a name the user chose. Renaming is refused once the conversation is deleted, like every other control in that row.

A rename is written to disk on the same terms a model change is: a conversation already stored is rewritten, and one not yet stored stays unstored. Renaming is not among the things that create a conversation's directory.

The metadata row includes a folder button and a new-agent button. The folder opens a left-docked file navigator rooted at the conversation's private workspace, or retargets the most recently focused navigator there, while focus stays on the conversation. The new-agent button opens an ordinary agent tab in the conversation tab's group with that same workspace as both its current directory and sandbox boundary. Both controls are disabled after the conversation is deleted.

The turn list is inset from the metadata row above it and the message input below it by more than either row insets itself, so the conversation reads as its own region instead of crowding them. It stays aligned with the title and the command line on the left.

The tab opens with the most recent 20 turns and the newest turn visible. An active tab follows each newly rendered query and streamed response to the bottom. Reaching the top loads 20 older turns at a time until the full history is visible; prepending that history preserves the current viewport instead of returning to the newest turn. Each turn shows the query, a sanitized Markdown response, and the harness/model pair that answered it. Responses appear progressively while the model is replying.

The model selector sits with the metadata row's right-aligned controls, ahead of the folder, new-agent, and split buttons rather than beside the title. It offers every model catalogued for the `claude` and `opencode` harnesses, grouped by harness. The selected pair applies to the next query. Changing it starts a fresh agent session; earlier turns keep the pair that produced them. If a saved pair is no longer catalogued, the next query uses the first available pair.

### The message input

The tab ends in the same command bar an agent tab does, and behaves the same way. Enter sends the query and clears the line; Shift+Enter starts a new line; Ctrl+Enter sends as well. The line grows as it fills and stops at the height the agent tab's does, scrolling beyond it. Up and Down walk back and forward through the queries already asked in this conversation, restoring whatever was being typed on the way past the newest one, and a query that extends what has been typed appears as ghost text that Right or End accepts. There is no send button: Enter is how a query is sent, as it always was.

The status dot blinks while a reply is streaming. Sending is refused during that time, and a refused Enter leaves the typed text in place, so a query composed while the previous reply finishes is not lost. Shift+Enter still starts a new line while streaming. Once the conversation is deleted the line is disabled outright.

The input takes focus when a conversation tab opens on screen. A conversation tab opened out of view does not take focus from whatever tab is showing. See [[tab-plugins]].

### Sessions, failures, and cancellation

Each conversation has one live ACP agent session at a time. A restarted app, cancelled reply, changed model, failed connection, or closed conversation tab ends that session. The next query starts another session and replays the 20 most recent completed turns before sending the new query.

Escape cancels a streaming reply. Cancellation discards the partial turn and writes nothing from it. A second query is refused while one is already in flight.

A failed query remains in the conversation with its error rendered in place. Rate-limit failures are identified explicitly. The failed session is forgotten so the next query reconnects and replays the stored context.

### Storage and workspace

Each conversation is stored in its own directory under the user's Janissary data directory. That directory contains the conversation record, an empty private workspace, and the workspace's private temporary directory. The directory is created when the first query is sent or either workspace control is used. Using a workspace control before the first query also saves the otherwise-empty conversation, so its workspace remains available after a restart. The directory survives application restarts and project workspace sweeps and is removed only when the conversation is deleted.

The conversation's ACP agent is tool-less. It runs with its current directory and sandbox workspace set to that conversation's private workspace, so it receives neither the project tree nor another conversation's data. Seatbelt confinement is best-effort: it applies on macOS while workspace sandboxing is enabled and available.

### Profiles

Conversation records and workspaces survive independently of profiles. Restoring a saved conversations view reopens the conversation list; individual open conversation tabs are not restored, and their saved conversations remain available from the list.
