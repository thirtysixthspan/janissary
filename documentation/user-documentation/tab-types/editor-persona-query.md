# Asking a persona for a change

<img class="agent-float" src="/agents/ahmed-south-east.png" alt="" />

An editor tab can ask an AI persona for a change to the text it's editing and apply the answer inline, without leaving the buffer and without opening a [monitor](/user-documentation/automation/monitoring) reporting tab. It's a single-shot request fired directly from the editor, not the batched, continuously-watching flow a monitor runs — though both read the same live buffer.

<img class="agent-float left" src="/agents/aslan-south-west.png" alt="" />
## Opening the query line

Press `>` while your caret sits at the very start of an otherwise-empty line to open a request line, right there in the buffer:

```
> assistant tighten this paragraph
```

The query line is visually distinct from ordinary rows — it shows no line number in its gutter, and the lines after it keep the numbers they'd have shown without it, so it reads as an insertion between two lines rather than a replacement of either one. Typing `>` anywhere else — mid-line, after other text, or over a selection — just inserts a literal `>`, exactly as before. One consequence: a Markdown blockquote's leading `>` can't be typed on an empty line this way — type the blockquote's body first, then add the leading `>` once the line isn't empty anymore.

Because the query line isn't buffer text, it's never saved, never counts toward unsaved changes, and is never sent to a monitor watching the buffer's live draft. Opening, editing, or closing it leaves the buffer untouched.

## Naming a persona and writing the request

The query follows the shape `> <persona> <request text>`, for example `> assistant rewrite this paragraph in one sentence`. `>>` at the start is shorthand for `> assistant`.

While your caret is in the persona-name word, `Tab` completes it against the personas available for editor requests — a separate list from the ones `monitor` offers, since a persona written for watching a transcript and one written for editing a buffer do different jobs. This is the only autocomplete the editor offers; it doesn't complete words anywhere else in the buffer.

The buffer and the query line are edited interchangeably while the query is open: click into either one to move focus there, and typing affects whichever one currently has it. Up/Down at the query's first or last line move focus into the buffer at the same column, landing on the line just above or below the query's anchor; the reverse works the same way from the buffer.

## Sending the request

Press `Enter`, `Ctrl+Enter` (`Cmd+Enter` on macOS), or click the `run` pill once the query names a persona and has request text. `Shift+Enter` inserts a line break in the query instead, so a request can span several lines. `Escape` closes the query line at any point, discarding it and returning focus to the buffer — if a request is already in flight, its reply is discarded when it arrives instead of opening a review panel.

A status pill at the end of the row tracks progress:

| Pill | Meaning |
| --- | --- |
| `agent?` | No persona named yet |
| `query?` | Persona named, no request text yet |
| `run` | Ready to send — click it or press `Enter` while it holds focus |
| `running...` | Request in flight |
| `no suggestion` | The persona proposed no change |

Only one request can be in flight or awaiting resolution per editor tab at a time; sending another while one is pending is ignored until the first resolves.

## Reviewing proposed changes

The persona is primed with the buffer's current content — including any unsaved edits, but never the query text itself — plus your request. It can propose one or more edits anywhere in the file, not just at the query's own location. Each proposed change previews inline immediately: removed lines are struck through, and inserted lines are highlighted with a `+` in place of a line number.

Each change carries its own thumbs-up/thumbs-down so you can accept or decline it independently of any others. With more than one change pending, a banner above the buffer reads "Accept or decline each change below" with a count of what's left; typing elsewhere in the buffer is blocked until every change is resolved.

The query line closes automatically once you've accepted at least one change. If you decline them all — or the persona proposed nothing — it stays open with your text intact so you can edit and retry.

If the named persona doesn't exist, the request fails, or the reply proposes no change, a notification names the persona and the outcome, and both the buffer and the query text are left untouched.

## Multi-turn context

The first request to a given persona in an editor tab opens a connection to it, visible in the tab's [connections window](/user-documentation/command-bar/connections), that stays open for the rest of the tab's life. Later requests to that same persona in the same tab reuse the connection, so the persona can draw on what it said earlier — the same as a multi-turn conversation. A request to a different persona opens its own separate connection alongside it. Closing a connection and firing a new request to that persona starts over from scratch.

## Nothing here is persisted

Like the rest of an editor tab's live state, an in-editor persona request exists only in memory for as long as the tab stays open — it's never saved to disk and never restored across a relaunch.
