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

A PDF tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to
the new PDF tab.

Unlike an agent tab, a PDF tab has no shell, agent session, browser, transcript, or command history,
and no persisted agent state. It is a **live, in-memory view** — like image and markdown tabs, it is
not saved and is not restored on `--relaunch`. A profile can still capture one and reopen it on
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

### Two page layouts

The stage shows the document in one of two layouts:

- **Single page** — one page at a time, fitted to the stage, moved between with the page keys or the header's Previous page and Next page buttons. The buttons appear only in this layout and are disabled at the first and last page respectively.
- **Continuous scroll** — every page stacked vertically in one scrolling stage, the way a markdown
  tab scrolls.

The stage exposes scrollbars when the document overflows, including in continuous layout and when zoomed in. They show the scroll position and can be dragged to move through the document.

A tab opens in **single page**. An icon-only button in the header switches between the two; its name
and tooltip say what the click will do, reading `Continuous scroll` while the tab is showing one page
and `Single page` while it is scrolling. Switching keeps the page currently in view. The choice is per
tab and live in memory: it is not persisted, not restored by `--relaunch`, and a second PDF tab opens
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

**Zoom controls**, active only while the PDF tab is the one on screen:

- **The header's `+` and `−`** — zoom in / out in 10% steps, clamped to 10%–800% and saturating at
  either end rather than overshooting.
- **Ctrl / Cmd + mouse wheel** — the same steps.
- **Escape** — return to 100%, which is the fit.

**Navigation controls**, likewise active only while the PDF tab is on screen — a PDF tab hidden
behind another tab, or in the other split pane, ignores all of them:

- **↑ / ↓ arrows** — in single page, move to the previous / next page, stopping at the first and last;
  in continuous scroll, scroll up / down by a small step.
- **Page Up / Page Down** — in single page, the same page movement; in continuous scroll, scroll by
  roughly one visible page.
- **Mouse wheel** — scroll, in both layouts. A plain wheel never zooms.

This deliberately differs from the image tab, where Page Up / Page Down and a bare wheel zoom: an
image has one page and nowhere to scroll, while in a document those keys already mean something.

A newly opened PDF tab starts on the first page at 100%. Zoom, scroll position, and the current page
are live and in-memory; none of them is persisted, restored on `--relaunch`, or carried into a
profile, which records the file only.

### Text selection

The document's text can be selected with the mouse and copied with the platform's own copy chord,
exactly as rendered Markdown can. There is no in-app copy button and no "copy all text" action. A
selection is highlighted in a color clearly distinct from the page, so it stays visible whatever the
active theme.

There is no in-document search: no find field, no match navigation, and no match highlighting.

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

The close button closes a tab by position, which need not be the active tab, performing the same
teardown the `close` command does for a non-last tab: the tab is removed from the strip, its in-memory
state is dropped, its registered file is unregistered, and, if it was the active tab, focus is
restored to whichever tab was focused immediately before it became active. Because a PDF tab owns no
shell, agent session, browser, or workspace — and no unsaved work — those teardown steps simply do
nothing for it. Closing the last remaining tab quits the app, exactly as the `close` command does.

### Reordering and grouping

A PDF tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous within it
(see Tabs → Tab grouping), can be reordered within its group with the reorder keys, and can be docked
into either sidebar like any other plugin tab.
