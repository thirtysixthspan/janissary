# Markdown Tab

A **markdown tab** displays a single Markdown file opened with the `open` command (see Open →
Markdown opener). It is a non-agent **view tab**: the file is rendered to formatted Markdown
(headings, lists, tables, fenced code, blockquotes, links) shown in place of the usual transcript
and command bar, and it is controlled by direct interaction (scrolling) rather than a command line.
It behaves like an image tab (see Image Tab) — same lifecycle and tab-strip treatment — differing
only in what fills the body and how that body is navigated.

A markdown tab is created like an agent tab (see Tabs) — placed contiguously within the active
tab's group, inheriting that group's number and bar color and taking a distinct dot color. Focus
moves to the new markdown tab.

Unlike an agent tab, a markdown tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — like image tabs and
browser windows (see Browser), it is not saved and is not restored on `--relaunch`. The rendered
content is a snapshot of the file as it was when opened; later edits to the file on disk are not
reflected until it is opened again.

### Recognized files

The Markdown opener claims the `.md` and `.markdown` extensions (case-insensitive). `open <file>.md`
mounts a markdown tab; `open external <file>.md` instead hands the file to the operating system's
default viewer, with no tab created (see Open). A path that matches a wildcard opens each matching
Markdown file in its own tab, subject to the shared `open` cap on the number of files.

### Markdown tab data

A markdown tab is distinguished from an ordinary tab by a **view kind** marking it as a markdown
view. Alongside it the tab carries the data the view needs:

- **name** — the file's name.
- **location** — the file's full path.
- **size** — the file's size, human-readable.
- a **reference** the web client can load to fetch the file's text (see Serving the file).

### Serving the file

The web client cannot read a local file path directly, and the app's web server otherwise serves
only its own bundled assets. Opening a Markdown file therefore **registers** it — the same
mechanism image tabs use — which adds it to an allow-list and yields a reference the client can
request. The server answers that reference, subject to the same origin/authentication checks as the
rest of the app, by streaming the bytes of that one registered file as text. Only files the user
has explicitly opened are served; arbitrary paths are never reachable, so this adds no
filesystem-traversal surface. A file's registration is dropped when its markdown tab is closed.

Keeping the file out of the application state (the client fetches it once by reference, rather than
the text riding inside every state broadcast) mirrors how image bytes are served and keeps state
updates small.

### Layout

A markdown tab's body has no command bar and no transcript. When the active tab is a markdown view,
the app renders the markdown view in place of the usual transcript-and-command-bar body; every other
tab renders unchanged. Tab switching and the route/history overlays continue to key off the active
tab as before.

The markdown view shows, stacked top to bottom:

1. **Metadata** — the file's name, size, and location, in a compact header, consistent with the
   image tab's header.
2. **The rendered Markdown**, filling the space beneath the metadata and scrolling independently.

### Rendering

The file's text is rendered the same way ACP replies are (see Markdown Rendering): parsed to HTML
with `marked` (GitHub-flavored Markdown — tables, fenced code, task lists), then **sanitized** with
`DOMPurify` before insertion so any active markup is stripped, and inserted as HTML. On a parse
failure the body falls back to showing the file's plain text. This rendering path is shared with the
transcript's Markdown so the two stay consistent.

Relative links to other local files (for example an image referenced as `./diagram.png`) are not
resolved — only the Markdown text itself is rendered.

### Appearance

The rendered Markdown follows the active application theme (see Application Themes), matching the
rest of the app's chrome:

- **Background and text** — the theme's own background and foreground colors; headings, code,
  tables, blockquotes, lists, rules, and links are styled to match, using the same colors the
  Markdown rendered inline in the transcript uses.
- **Selection** — selecting text highlights it in a color clearly distinct from the background, so
  the selection stays visible regardless of the active theme.

### Scrolling

The rendered Markdown scrolls within the tab body, with a visible scrollbar. Unlike an image tab,
there is no zoom or panning — the view only scrolls vertically.

**Scroll controls**, active while the markdown tab is showing:

- **↑ / ↓ arrows** — scroll up / down by a small step (a line).
- **Page Up / Page Down** — scroll up / down by roughly one visible page.
- **Mouse wheel** — scroll up / down.

A newly opened markdown tab starts scrolled to the top. Scroll position is live and in-memory; it is
not persisted or restored on `--relaunch`.

### Tab strip: name and close button

In the tab strip a markdown tab reads exactly like an ordinary tab — same dot, group bar, active
highlight, and ordering — with two differences:

- **Name.** The tab's name is always `markdown` (the file name is shown in the tab's metadata
  header, not in the strip). Per [[tab-label-no-markers]], no type or status marker is appended —
  the name only.
- **Close button.** A close control is shown right-aligned within the tab, immediately after the
  name. Clicking it removes that tab without first selecting it; the click does not also trigger tab
  selection. The close button is specific to view tabs (agent tabs continue to close via the
  `close` command).

### Closing

The close button closes a tab by position, which need not be the active tab, performing the same
teardown the `close` command does for a non-last tab: the tab is removed from the strip, its
in-memory state is dropped, its registered file is unregistered, and, if it was the active tab,
focus is restored to whichever tab was focused immediately before it became active (falling back
to an adjacent tab if that one no longer exists). Because a markdown tab owns no shell, agent
session, browser, or workspace, those teardown steps
simply do nothing for it. Closing the last remaining tab quits the app, exactly as the `close`
command does (see `tabs.md`).

### Reordering and grouping

A markdown tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous
within it (see Tabs → Tab grouping), and can be reordered within its group with the reorder keys
like any other tab — it can never be dragged out of the group it was opened from.
