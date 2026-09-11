# Conversations

Keep a conversation with a model and reopen its saved history from any project on this machine.

```
conversations
```

## Start or reopen a conversation

<img class="agent-float" src="/agents/bilal-south-west.png" alt="" />

The list shows conversations in order of most recent activity. If you haven't saved any, it says `No conversations yet`. Click **New conversation** in the header, or press `Cmd+N` / `Ctrl+N` while the list has focus, to open a new conversation tab.

The first row is selected when the list opens. `↑` and `↓` move the selection without wrapping; `Home` and `End` select the first and last rows. Press `Enter` to open the selected conversation. With the mouse, click the same row twice: the first click selects it, and the next opens it. This also applies to a row already selected by the keyboard. Opening a conversation focuses its existing tab if one is open.

You can also open a conversation by its full title:

```
conversations Weekend plans
```

Title matching ignores case. If there is no match, you see `No conversation matching "<title>".`. The words `left` and `right` are reserved for docking, so use the list to open conversations with those titles.

`conversations left` and `conversations right` dock the list in a sidebar. Bare `conversations` brings it back to the center. See [Tabs](/user-documentation/getting-started/tabs) for shared sidebars.

## Ask a question

Type your query into **Message** at the bottom of the conversation tab. Press `Enter` or `Ctrl+Enter` to send it; `Shift+Enter` adds a newline. The input grows with your text, then scrolls when it reaches its maximum height. It takes focus when you open the tab on screen.

Replies appear progressively as formatted Markdown. Each turn shows your query, the reply, and the harness/model pair that answered it. The view follows new queries and streamed replies to the bottom, unless you scroll away to review earlier turns — scrolling back to the bottom resumes following. It initially shows the newest 20 turns; scroll to the top to load 20 older turns at a time.

Use `↑` on the first input line and `↓` on the last to recall previous queries from this conversation. Moving past the newest query restores your draft. If a previous query starts with what you're typing, the rest appears as ghost text. Press `→` or `End` with the caret at the end to accept it.

The status dot blinks while a reply is streaming. You can draft another query, but `Enter` won't send it until the reply finishes, and your draft stays in place. `Shift+Enter` still adds a newline.

## Name the conversation

<img class="agent-float left" src="/agents/demir-south.png" alt="" />

A new tab starts as `New conversation`. Your first query names it from that query's first line, capped at 60 characters. Later queries leave the title alone.

Double-click the title in the header to rename it. Press `Enter` or click away to save, or `Escape` to cancel. Names are trimmed and limited to 60 characters; a blank name leaves the old title unchanged. A title you choose before the first query is preserved, unless you name it `New conversation` again.

## Choose a model

The **Model** selector in the header groups available models under `claude` and `opencode`. Choose a pair for your next query. Changing it starts a fresh session; earlier turns keep the pair that answered them. The selector is disabled while a reply streams. If a saved model is no longer available, the next query uses the first available pair.

Restarting the app, cancelling a reply, or a failed connection also ends the live session. Closing the tab while a reply streams cancels that reply. When a query starts a fresh session, it includes the last 20 stored turns as context, including the error text of failed turns. Older history remains available to read in the tab.

## Cancel or retry a reply

Press `Escape` while a reply streams to discard that partial turn. It is not saved. If that query supplied the initial title, cancellation restores `New conversation`, unless you renamed it while the reply was streaming.

A failed query stays in the history with its error in place of the reply. Rate-limit errors begin with `Rate limited:`. Send another query when you're ready to retry; the failed session is replaced automatically.

## Use the private workspace

<img class="agent-float" src="/agents/yusuf-south-east.png" alt="" />

Each conversation has a private workspace. The header's **Open file navigator in this workspace** folder button opens a left-docked navigator there, or retargets the most recently focused navigator, while keeping focus on the conversation. **New agent in this workspace** opens an agent in the same group, with that workspace as its working directory and sandbox boundary.

The first query or either workspace button creates the workspace. Using a workspace button before asking anything also saves the empty conversation, so you can reopen it after restarting.

Saved conversations live under `~/.janissary/conversations/`, shared across projects on this machine. Their history and workspaces survive restarts and project workspace cleanup. [Profiles](/user-documentation/automation/profiles) restore the conversation list, rather than individual conversation tabs; reopen those from the list.

## Delete a conversation

Use the row's **Delete** button in the conversation list. Confirming deletes its saved history, private workspace, and everything inside that workspace. Cancelling leaves them intact.
