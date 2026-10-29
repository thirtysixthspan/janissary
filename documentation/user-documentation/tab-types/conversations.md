# Conversations

Keep a conversation with a model and reopen its saved history later, in the same project.

```
conversations
```

## Start or reopen a conversation

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

The list shows this project's conversations in order of most recent activity, each row carrying its title, the date and time it was last touched, and a trash button that deletes it. If you haven't saved any, it says `No conversations yet`. Click the **+** button (**New conversation**) in the header, or press `Cmd+N` / `Ctrl+N` while the list has focus, to open a new conversation tab.

Sending a query moves a conversation to the top. Renaming it or changing its model doesn't. A conversation you created but haven't asked anything yet shows in the list while the app runs, but it isn't saved, so it's gone after a restart. A saved conversation whose record is missing or unreadable doesn't appear.

The first row is selected when the list opens. `↑` and `↓` move the selection without wrapping; `Home` and `End` select the first and last rows. Press `Enter` to open the selected conversation. With the mouse, click the same row twice: the first click selects it, and the next opens it. This also applies to a row already selected by the keyboard. Opening a conversation focuses its existing tab if one is open.

You can also open a conversation by its full title:

```
conversations Weekend plans
```

Title matching ignores case. If there is no match, `conversations <title>` reports `No conversation matching "<title>".`. Use the singular form to start a conversation when the title is new:

```
conversation What changed in the latest release?
```

If no saved conversation has that title, Janissary creates one and sends the title text as its first query. A matching title opens the saved conversation instead. The new conversation starts on the model you last chose in this project.

Bare `conversation` opens the list, or focuses it if it's already open.

`conversations left` and `conversations right` dock the list in a sidebar. Bare `conversations` brings it back to the center. Bare `conversation` leaves a docked list where it is. The words `left` and `right` only mean docking with the plural command, even when a conversation has one of those titles. `conversation left` opens a conversation titled `left`, or starts one with `left` as its first query. See [Tabs](/user-documentation/getting-started/tabs) for shared sidebars.

## Ask a question

Type your query into **Message** at the bottom of the conversation tab. Press `Enter` or `Ctrl+Enter` to send it; `Shift+Enter` adds a newline. There's no send button. `Escape` throws away what you have typed and is not sent. The input grows with your text, then scrolls when it reaches its maximum height. It takes focus when you open the tab on screen. A tab that opens while you're looking at another one doesn't take focus from it, and the box takes your typing once you switch over.

Replies appear progressively as formatted Markdown. Each turn shows your query, the reply, and the harness/model pair that answered it. The view follows new queries and streamed replies to the bottom until you scroll away yourself to review earlier turns. A reply growing beneath the view doesn't count as scrolling away. Scrolling back to within 40 pixels of the bottom resumes following. The tab opens on the newest 20 turns. Scroll to the top to load 20 older turns at a time, for as long as older turns remain. The view stays where you were instead of jumping back to the newest turn.

In a query that spans several lines, `↑` and `↓` move the caret between them first. Once the caret is on the first or last line, they recall previous queries from this conversation. Moving past the newest query restores your draft. If a previous query starts with what you're typing, the rest appears as ghost text. Press `→` or `End` with the caret at the end to accept it.

Starting from a text selection — through **Chat about this** in the [right-click menu](/user-documentation/getting-started/context-menus) — puts that text in the turn list as a turn you posed, with no reply under it and nothing sent yet. The message box starts empty, because the selection is context rather than a question: it reaches the model only once you write a prompt and send it, and that first query carries the selection along. Nothing about it is kept. Close the tab without sending and the selection is gone for good; reopening the conversation will not bring it back.

The status dot blinks while a reply is streaming. You can draft another query, but `Enter` won't send it until the reply finishes, and your draft stays in place. `Shift+Enter` still adds a newline. `Escape` cancels the reply instead of touching your draft (see below).

## Name the conversation

<img class="agent-float left" src="/agents/demir-south.png" alt="" />

A new tab starts as `New conversation`. Your first query names it from that query's first line, capped at 60 characters. Later queries leave the title alone.

Double-click the title in the header to rename it. Press `Enter` or click away to save, or `Escape` to cancel. Names are trimmed and limited to 60 characters; a blank name leaves the old title unchanged. A title you choose before the first query is preserved, unless you name it `New conversation` again.

## Choose a model

The **Model** selector in the header groups available models under `claude` and `opencode`. Choose a pair for your next query. Changing it starts a fresh session; earlier turns keep the pair that answered them. The selector is disabled while a reply streams. If a saved model is no longer available, the next query uses the first available pair.

The last pair you chose is remembered for this project: it crosses between conversations and survives a restart, and every new conversation starts on it. Another project has its own remembered pair. A conversation you reopen keeps the pair it was saved with. Sending a query does not change that memory — only picking a different pair does. So a conversation started from the list and one started from **Chat about this** begin identically.

A conversation runs one agent session at a time. Restarting the app, cancelling a reply, changing the model, a failed connection, or closing the tab all end that session; the next query starts another and replays the 20 most recent turns into it first, so a conversation picks up its context rather than starting cold. A turn that failed is replayed too, error text and all. Older history remains available to read in the tab.

## Cancel or retry a reply

While the conversation tab is active, press `Escape` during a reply to discard that partial turn. It is not saved. A hidden conversation tab does not handle `Escape`. Closing the tab mid-reply does the same. If that query supplied the initial title, cancellation restores `New conversation`, unless you renamed it while the reply was streaming.

A failed query stays in the history with its error in place of the reply. Rate-limit errors begin with `Rate limited:`. Send another query when you're ready to retry; the failed session is replaced automatically.

If the workspace or the agent session can't be set up after you send a query, the turn disappears, a title that query supplied goes back to `New conversation`, and a notification reports `Could not start the response: <reason>`. The next query tries again.

If saving a completed or failed turn does not work, the turn stays visible with `Response is available but could not be saved: <reason>`. A notification reports the failure. You can send another query, but Janissary does not retry saving the turn automatically.

## Use the private workspace

<img class="agent-float" src="/agents/yusuf-south-east.png" alt="" />

Each conversation has a private workspace. The header's **Open file navigator in this workspace** folder button opens a left-docked navigator there, or retargets the most recently focused navigator, while keeping focus on the conversation. **New shell in this workspace** opens a shell in the same group, with that workspace as its working directory and sandbox boundary.

The conversation's own agent has no tools. Janissary turns down every tool request it makes, so a reply is text and nothing else. The agent runs from the private workspace, so it doesn't see your project files or any other conversation. On macOS, with workspace sandboxing enabled and available, it is also confined to that workspace. Where that confinement isn't available, the workspace is still its working directory, but nothing else holds it there. The workspace belongs to the conversation rather than to the tab: closing the tab or quitting the app leaves it in place, and it goes only when you delete the conversation.

The first query or either workspace button creates the workspace. Using a workspace button before asking anything also saves the empty conversation, so you can reopen it after restarting.

Saved conversations live in the current project's `.janissary/conversations/` directory. Each project has its own history and remembered model selection, so a conversation from one project never shows up in another. History and private workspaces survive restarts and project workspace cleanup. A [profile](/user-documentation/automation/profiles) can reopen the conversation list, but not individual conversation tabs; reopen those from the list.

An earlier version kept conversations and the remembered model for the whole machine instead of per project. Those stay where they were, and Janissary doesn't import them into a project.

## Delete a conversation

Use the trash button on a row in the conversation list. It asks `Delete conversation "<title>"?` before touching anything. Confirming deletes its saved history, private workspace, and everything inside that workspace. Cancelling leaves them intact.

The saved record stays with its project through restarts and workspace cleanup, and only deleting the conversation removes it.
