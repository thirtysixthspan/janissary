# PDF Tab

A **PDF tab** displays a single PDF document opened with the `open`, `edit`, or `pdf` command (see
Open → PDF plugin opener). It is a non-agent **view tab**: the document's pages are drawn in the app
in place of the usual transcript and command bar, and it is controlled by direct interaction —
scrolling, the page keys, the header's controls, and the page strip — rather than a command line. It
behaves like an image tab (see Image Tab) — same lifecycle and tab-strip treatment — differing only
in what fills the body and how that body is navigated.

The PDF view is contributed by a **bundled tab plugin** rather than by the application core (see
[[tab-plugins]]). Nothing about the view changes because of that: the same file types open the same
way, and the plugin is present in every build.

A PDF tab is created like a shell tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to
the new PDF tab.

Unlike a shell tab, a PDF tab has no shell, agent session, browser, transcript, or command history,
and no persisted agent state. It is a **live, in-memory view** — like image and markdown tabs, it is
not saved and is not restored. A profile can still open one on
launch (see [[profiles]]). The document shown is the file as it was when opened; later edits to the
file on disk are not reflected until it is opened again.

### Recognized files

The PDF plugin claims the `.pdf` extension (case-insensitive). `open paper.pdf` mounts a PDF tab;
`open external paper.pdf` instead hands the file to the configured or default PDF application, with
no tab created (see Open). A path that matches a wildcard opens each matching PDF in its own tab,
subject to the shared `open` cap on the number of files. Opening a file that already has a PDF tab
focuses that tab instead of opening a second one, as it does for every other plugin view.

The plugin also claims the `edit` verb for `.pdf`, so `edit paper.pdf` — and Shift-activation of a
PDF row in the file navigator, which sends that same command — opens the viewer rather than the
plain-text editor. The document is never written to: there is no annotation, form filling, or
signing, and so no unsaved work and no save-changes prompt on close.

### PDF tab data

A PDF tab is distinguished from an ordinary tab by a **view kind** marking it as a plugin view,
together with the identity of the plugin that owns it. Alongside it the tab carries the data the view
needs:

- **name** — the file's name.
- **location** — the file's full path.
- **size** — the file's size, human-readable.
- a **reference** the web client can load to fetch the file's bytes (see Serving the file).

### Serving the file

The web client cannot read a local file path directly, and the app's web server otherwise serves only
its own bundled assets. Opening a PDF therefore **registers** it — the same mechanism image and
markdown tabs use — which adds it to an allow-list and yields a reference the client can request. The
server answers that reference, subject to the same origin/authentication checks as the rest of the
app, by streaming the bytes of that one registered file. Only files the user has explicitly opened are
served; arbitrary paths are never reachable, so this adds no filesystem-traversal surface. A file's
registration is dropped when its PDF tab is closed.

The document is rendered in the browser rather than by the operating system's own PDF plugin, which
is what lets the tab follow the application theme and carry the controls described below. Everything
it needs to do so ships with the app and is served from the app's own address, so a PDF renders the
same way offline, behind a proxy, and on a remote server.

The server supplies the document and rendering assets; it never renders the document's pages itself.

During development, only readable character maps and standard fonts contained in the installed renderer package are served as PDF assets, with an explicit content type. Missing assets and paths escaping that package, including through links, use the development server's normal not-found handling.

### Layout

A PDF tab's body has no command bar and no transcript. When the active tab is a PDF view, the app
renders the PDF view in place of the usual transcript-and-command-bar body; every other tab renders
unchanged.

The PDF view shows, stacked top to bottom:

1. **Metadata** — the file's name, size, and location, in a compact header, consistent with the image
   tab's header. To the right of it sit the page-strip toggle, the layout toggle, the zoom and page controls,
   and the Split action when available.
2. **The document**, filling the space beneath the metadata: the page strip down the left edge when
   it is showing, and the page stage taking the rest.

A **position readout** in the header names the page currently in view and the document's page count,
as `3 / 12`.

Once the document is loaded, its metadata, initial position, and controls are available even before the first page is drawn.

### Two page layouts

The stage shows the document in one of two layouts:

- **Single page** — one page at a time, fitted to the stage, moved between with the page keys or the header's Previous page and Next page buttons. The buttons appear only in this layout and are disabled at the first and last page respectively.
- **Continuous scroll** — every page stacked vertically in one scrolling stage, the way a markdown
  tab scrolls.

The stage exposes scrollbars when the document overflows, including in continuous layout and when zoomed in. They show the scroll position and can be dragged to move through the document.

A tab opens in **single page**. An icon-only button in the header switches between the two; its name
and tooltip say what the click will do, reading `Continuous scroll` while the tab is showing one page
and `Single page` while it is scrolling. Switching keeps the page currently in view. The choice is per
tab and live in memory: it is not persisted, not restored, and a second PDF tab opens
in single page regardless of what the first was switched to.

### The page strip

A second icon-only header button shows and hides a strip of page thumbnails down the left edge of the
tab body. Its name and tooltip also say what the click will do, reading `Show pages` while the strip
is hidden and `Hide pages` while it is showing. The strip **starts hidden**, so a newly opened
document is all document.

Clicking a thumbnail goes to that page — scrolling it into view in continuous layout, making it the
shown page in single-page layout — and the thumbnail of the page currently in view is highlighted.
The strip is available in both layouts, because it is also how a reader skims a long document they are
scrolling. It is the only navigation panel: there is no document outline, bookmark list, or
attachments panel.

Only the pages near the view are drawn, in the stage and in the strip alike, so opening a long
document does not draw every page at once.

### Zoom and keys

The fit follows the stage's available width and height, including changes caused by showing or hiding the page strip, splitting the pane, or docking into a sidebar. The selected zoom percentage stays the same as the fitted size adjusts.

**100% means fitted**, and what it fits depends on the layout: in single page the whole page fits
inside the stage, and in continuous scroll the page's width fits so scrolling is the only axis that
matters. Beyond 100% the page overflows and the stage scrolls in both directions; there is no
click-drag panning. The current percentage is shown on the view only while it differs from 100%.

The keys belong to one PDF tab at a time, so a centre PDF and a docked PDF never both answer the same key. A centre PDF tab owns them while it is the current tab among the centre panes and focus is not inside another tab, including when focus rests on its own page. A PDF tab shown in a sidebar owns them only while focus is inside it (clicking its page puts focus there).

**Zoom controls**, active only in the tab that owns the keys:

- **The header's `+` and `−`** — zoom in / out in 10% steps, clamped to 10%–800% and saturating at
  either end rather than overshooting.
- **Ctrl / Cmd + mouse wheel** — the same steps.
- **Escape** — return to 100%, which is the fit.

**Navigation controls**, likewise active only in that tab — a PDF tab hidden behind another tab, in
the other split pane, or shown in a sidebar without focus inside it, ignores all of them, and so
does the current centre PDF tab while focus is inside another tab, such as a docked shell, harness,
or files sidebar:

- **↑ / ↓ arrows** — in single page, move to the previous / next page, stopping at the first and last;
  in continuous scroll, scroll up / down by a small step.
- **Page Up / Page Down** — in single page, the same page movement; in continuous scroll, scroll by
  roughly one visible page.
- **Mouse wheel** — scroll, in both layouts. A plain wheel never zooms.

This deliberately differs from the image tab, where Page Up / Page Down and a bare wheel zoom: an
image has one page and nowhere to scroll, while in a document those keys already mean something.

A newly opened PDF tab starts on the first page at 100%. Zoom, scroll position, and the current page
are live and in-memory; none of them is persisted or restored.

### Text selection

The document's text can be selected with the mouse and copied with the platform's own copy chord,
exactly as rendered Markdown can. There is no in-app copy button and no "copy all text" action. A
selection is highlighted in a color clearly distinct from the page, so it stays visible whatever the
active theme.

### Find

`Cmd+F` opens the editor tab's find overlay over the PDF tab while that tab is active: the current tab among the centre panes, or a PDF tab shown in a sidebar while focus is inside it. It is the same overlay the editor (see [[editor-tab]]) and shell (see [[shell-tab]]) tabs use: the same focused input, the same ranked rows, the same appearance and keys, and the same `type to search` and `No matching lines` states. When another tab is focused, the chord means what it means there: the editor's find, the shell's transcript find, or whatever else that tab does with it. Find changes only what is in view and never writes to the document. `Ctrl+F` does not open the overlay; the PDF tab adds no `Ctrl+F` binding.

While the PDF tab is active and the chord reaches it — the current tab among the centre panes, or a PDF tab shown in a sidebar while focus is inside it — `Cmd+F` is answered even before the document has loaded and after a load failure. In those states it does nothing visible, and the browser's own find bar does not open. If the document fails while the overlay is open, the overlay closes and every mark clears.

The overlay sits against the bottom edge of the tab, spans the tab's full width, covers the page strip when it is showing, takes at most 70% of the tab's height, and scrolls its rows when they overflow. It is available in both page layouts. The input opens focused, and its placeholder and accessible name are `Search document`. While focus is in the overlay's input, it takes the keyboard, so the PDF view's arrows, page keys, and Escape do not also act on the document behind it. While focus is outside the overlay, the arrow and page keys work on the document as usual in the PDF tab that owns the keys (see § Zoom and keys).

Matching is the editor's: one uninterrupted, case-insensitive occurrence of the typed text, with no regex, case, or whole-word options. Up to ten rows are listed. The whole document is searched, every page, not only the pages that have been drawn. Each searchable line is one visual line of text on a page; two lines with the same text are two rows. A match must sit within one line. A phrase that wraps onto the next line, or a word hyphenated across a line break, is not found. This is a documented limitation, not a bug.

Case-insensitive matches emphasize the complete original text even when lowercasing changes a character's length.

The text is read once per tab, the first time the overlay opens, and kept until the tab closes or a render failure invalidates the document. The document shown never changes after it is opened. Results fill in page by page while the read is in progress and re-rank as each page arrives. When the first search starts reading text, a polite screen-reader announcement says that reading has started; once matching results first appear, it announces their availability without announcing each page. A page whose text cannot be read contributes no lines and sends no notification; reading for Find is best-effort, which is separate from a page whose drawn text layer fails to render, and that still follows § When a document cannot be rendered. If a render failure invalidates the document during extraction, an in-flight page request may settle, but its result is discarded, no later page is read, and previously extracted lines are cleared. Merely switching away closes the overlay but leaves extraction and its retained lines alone, so returning to the tab can search them without starting over. A document with no text, such as a scanned PDF of page images, is searched like any other; once reading finishes, every query with non-whitespace text answers `No matching lines`, with no separate no-text message.

An empty or whitespace-only query shows `type to search` with no rows and no marks. Each row is one matching line: the line's 1-based page number, dimmed, where the editor shows a line number, then the line's text with the matched characters emphasized. A line too long for the overlay is clipped with an ellipsis rather than wrapped. Rows are ranked as the editor ranks them, best-scoring first, and capped at ten; an occurrence outside the ten is reached by refining the query. While the document's text is still being read and the query has non-whitespace text, a muted `Reading pages…` row shows below the results, or in place of `No matching lines` when there are none, and disappears when reading finishes. When reading finishes, a polite screen-reader announcement gives the final result count or says `No matching lines`; if ten rows are shown, it says `10 or more matching lines` because the list is capped. If the query is still empty, it announces that the document text is ready to search.

`↑` / `↓` and a click highlight a row and move the view to that match immediately. A click keeps focus in the overlay's input. In single page, the match's page becomes the shown page. In continuous scroll, the stage scrolls so the matched line sits about a quarter of the stage's height below the stage's top edge, clamped by the stage's scroll limits; that places the line above the overlay. Past 100% in single page, the stage also scrolls to that quarter position. The header's position readout and the page strip's highlighted thumbnail follow, as for any other page change. No text selection is made. Pressing `↓` before any result has arrived leaves the first row selected rather than clearing it, so the first match is highlighted as soon as it appears. Return moves to the first ranked match even when another row is highlighted, and the overlay stays open.

Escape closes the overlay and leaves the view at the last previewed match. It does not reset zoom. With the overlay closed, Escape resets zoom to 100% as today. Escape closes the overlay the same way when focus has left its input and is on the page. Closing the overlay returns focus to the element that had it before `Cmd+F` was pressed, if that element is still in the document and another text field has not taken focus. Closing because the tab stopped being active restores nothing, since focus has already moved. Switching away from the PDF tab closes the overlay; returning and pressing `Cmd+F` opens a fresh, empty one. Closing by any route discards the query and the highlighted row, so reopening starts empty.

While the overlay is open, `Cmd+F` keeps it open. With focus in the input, it selects the whole query so typing replaces it. With focus outside the input, it focuses the input and selects the query. The browser's find bar never appears.

While the overlay is open with a query that has non-whitespace text, every occurrence on the drawn pages is marked, not only the ten listed. The occurrence behind the highlighted row is marked more strongly than the rest. Pages drawn later while the overlay is open get their marks too. Reading another page's text leaves the marks already painted in place, unless that page's lines change which occurrence the highlighted row points at; then the stronger mark moves to it. Closing the overlay clears every mark. A split's non-active PDF pane does not answer `Cmd+F`, and its marks clear when it stops being active. A PDF tab docked into a sidebar answers `Cmd+F` whenever its sidebar shows it and focus is inside it, so it and a centre PDF tab can each hold an open overlay; each marks only its own document, and closing one leaves the other's marks in place. The marks use the theme accent at a low and a higher translucency, both translucent enough for the page's own text to show through. They stay distinct from the text layer's blue selection and stay inside the PDF tab.

### Confined to its own tab

Everything the PDF view brings with it applies to the PDF view alone. Opening a PDF changes nothing
about how the rest of the application looks — the tab strip, either sidebar and whatever is docked
into it, the transcript, and every other open tab render exactly as they did before, and go on doing
so for the rest of the session once the PDF tab is closed. The document renderer the tab is built on
carries the appearance of the viewer application it was written for; none of that reaches past this
tab.

### When a document cannot be rendered

If the document cannot be rendered, the stage is replaced by `Failed to load <name>` and the tab stays
open, with its metadata header intact. One line additionally goes to the notifications feed (see
[[notifications]]) naming what went wrong, because the tab body is not always on screen:

- `<name> is password-protected`
- `<name> could not be read`
- `Could not display <name>` for anything else.

An encrypted document is reported, not negotiated: there is no password prompt and no way to supply
one.

A page or its selectable text failing to render uses the same failed body and the `Could not display <name>` notification. Each tab reports at most once. Cancelling or replacing a render, closing the tab, or failing to draw a thumbnail does not fail the document or send a notification.

### Tab strip: name and close button

In the tab strip a PDF tab reads exactly like an ordinary tab — same dot, group bar, active highlight,
and ordering — with two differences:

- **Name.** The tab's name is the file's name, while its internal label stays distinct (`pdf`,
  `pdf-2`, …) so several PDF tabs can coexist. No type or status marker is appended — the name only.
- **Close button.** A close control is shown right-aligned within the tab, immediately after the name.
  Clicking it removes that tab without first selecting it; the click does not also trigger tab
  selection.

### Closing

Closing a PDF tab cancels any unfinished document load and releases its rendering resources. A result arriving after close never changes the view or produces a failure notification.

The close button closes its own tab by name, which need not be the active tab, performing the same
teardown the `close` command does for a non-last tab: the tab is removed from the strip, its in-memory
state is dropped, its registered file is unregistered, and, if it was the active tab, focus is
restored to whichever tab was focused immediately before it became active. Because a PDF tab owns no
shell, agent session, browser, or workspace — and no unsaved work — those teardown steps simply do
nothing for it. Closing the last remaining tab quits the app, exactly as the `close` command does.

### Reordering and grouping

A PDF tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous within it
(see Tabs → Tab grouping), can be reordered within its group with the reorder keys, and can be docked
into either sidebar like any other plugin tab.
