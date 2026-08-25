# Image Tab

An **image tab** displays a single image opened with the `open` command (see Open → Image opener).
It is a non-agent **view tab**: it shows the image and its metadata in place of the usual
transcript and command bar, and is controlled by direct interaction (zoom, pan, and the scroll wheel)
rather than a command line.

The tab has **two modes**. The **viewer** is the read-only zoom-and-pan surface described below. The
**editor** replaces the image with a canvas and a toolbar offering five geometry operations, and
saves its result to the original file. The same tab holds both; the header's pen-shaped
**Edit image** icon and **Done** control move between them, and `edit <image>` opens the tab already
in the editor.

The image view is contributed by a **bundled tab plugin** rather than by the application core (see
[[tab-plugins]]). Nothing about the view changes because of that: the same file types open the same
way, and the plugin is present in every build. What follows describes the behavior; where it differs
from other plugin tabs, the difference is called out.

An image tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves
to the new image tab.

Unlike an agent tab, an image tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — like browser windows
(see Browser), it is not saved and is not restored on `--relaunch`. A profile can still capture one
and reopen it on launch (see [[profiles]]).

### Image tab data

An image tab is distinguished from an ordinary tab by a **view kind** marking it as a plugin view,
together with the identity of the plugin that owns it. Alongside it the tab carries the data the
view needs:

- **name** — the file's name.
- **location** — the file's full path.
- **size** — the file's size, human-readable.
- a **reference** the web client can load to fetch the image bytes (see Serving the image).
- an optional **mode** saying the tab was opened for editing rather than for viewing. Absent means
  the viewer.

The image's pixel dimensions are not part of this data; the client measures them from the loaded
image and lays the view out accordingly (see Sizing).

### Serving the image

The web client cannot read a local file path directly, and the app's web server otherwise serves
only its own bundled assets. Opening an image therefore **registers** the file, which adds it to an
allow-list and yields a reference the client can request. The server answers that reference —
subject to the same origin/authentication checks as the rest of the app — by streaming the bytes
of that one registered file, with a content type derived from its extension. Only files the user
has explicitly opened are served; arbitrary paths are never reachable, so this adds no
filesystem-traversal surface. A file's registration is dropped when its image tab is closed.

Viewer mode makes exactly one authenticated request for that reference: the image element shown in
the zoom-and-pan stage is also the decoded pixel source retained for editing. This is the same
whether `open` came from a command bar or from the file navigator. While editor mode replaces that
visible image with a canvas, one hidden image element holds the source instead; the two are never
mounted together.

### Layout

An image tab's body has no command bar and no transcript. When the active tab is an image view, the
app renders the image view in place of the usual transcript-and-command-bar body; every other tab
renders unchanged. Tab switching, scrolling, and the route/history overlays continue to key off the
active tab as before.

The image view shows, stacked top to bottom:

1. **Metadata** — the image's name, size, and location, in a compact header, with the mode controls
   and the Split action at the right edge. In the viewer the header offers an icon-only, pen-shaped
   **Edit image** button, with `Edit image` as both its accessible name and tooltip; in the editor it
   offers **Save** and **Done**, the dimensions the current edits will produce, and, briefly after a
   save, the name of the file written.
2. **The image** itself, filling the space beneath the metadata — the viewer's zoom-and-pan stage, or
   the editor's toolbar and canvas.

### Sizing

At 100% zoom the image is fit to the available tab area according to its **orientation**, measured
from the image's natural dimensions once loaded:

- **Landscape** (width greater than height) → the image occupies the **full width** of the
  available tab space.
- **Portrait** (height greater than or equal to width) → the image occupies the **full remaining
  height** beneath the metadata header.

In both cases only one dimension is constrained and the other follows, preserving the image's
aspect ratio. The fit is recomputed when the image loads and when the tab is resized.

### Zoom

The image can be zoomed in and out about its fit. **100%** is the fit-to-tab size described under
Sizing; zooming scales the image relative to that baseline, preserving aspect ratio.

**Zoom controls**, active while the image tab is showing:

- **Page Up** or **scroll-wheel up** — zoom **in** (more).
- **Page Down** or **scroll-wheel down** — zoom **out** (less).
- **Escape** — reset zoom to **100%** and center the view.

Each key press or wheel notch changes zoom by a fixed step of 10%; holding Page Up / Page Down
repeats. Zoom is clamped to the range **10%–800%** and saturates at those bounds.

While zoomed (any level other than 100%) the current **zoom percentage** is shown on the view (for
example, `150%`); at 100% no indicator is shown.

### Panning

When the image is zoomed in beyond the tab area, the out-of-view parts are reached by panning:

- **Arrow keys** (↑ / ↓ / ← / →) — pan in that direction; hold an arrow to pan continuously.
- **Click and drag** — press the primary mouse button on the image and drag to pan freely in any
  direction.

No scrollbars are shown; panning is via the arrow keys and drag. Zoom and pan are live, in-memory:
a newly opened image tab starts at 100% zoom with no offset, and the state is not persisted or
restored on `--relaunch`. Switching to a different image tab resets zoom and pan to their defaults.
The zoom and pan keys act only on the image tab currently on screen: an image tab in the other split
pane, or one hidden behind another tab, ignores them entirely.

### Editing

The header's pen-shaped **Edit image** button replaces the viewer with the editing surface: a toolbar
above a canvas showing the image with the current edits applied. The editor is entirely local — it
needs no network and no third-party service — and offers **geometry only**:

- **Crop** — starts with a rectangle covering the full image; drag it or adjust it by its edges and
  corners. The rectangle reports the pixel dimensions it will produce while it moves, and is held
  inside the image, so a drag that runs past an edge stops at the edge and can never describe an
  empty area.
- **Rotate left** and **Rotate right** — turn the image 90° in that direction, swapping its
  dimensions.
- **Flip horizontal** and **Flip vertical** — mirror the image about that axis.

Crop is a drag gesture with live numbers; there are no typed width, height, or offset fields. Rotate
and flip apply immediately; crop is applied by the **Apply crop** control beside the toolbar, or
abandoned by **Cancel crop**.

While the editor is active, `Cmd+S` / `Ctrl+S` saves through the same path as **Save**, and `Escape`
returns to the viewer through the same path as **Done**. Escape keeps the operation list live; in
viewer mode it instead keeps its existing zoom-reset behavior.

There is no drawing, text, shape, sticker, frame, filter, or AI feature, and no way to edit more than
one image at a time.

### Undo and redo

Edits are an ordered list of operations replayed from the original image, so nothing is baked in
until a save. **Undo** and **Redo** in the toolbar, and `Cmd+Z` / `Ctrl+Z` and `Cmd+Shift+Z` /
`Ctrl+Shift+Z`, step back and forward through that list. Applying a new operation after an undo
discards whatever was waiting to be redone. Like the zoom and pan keys, the undo chords act only on
the image tab currently on screen.

### Saving an edit

**Save** replaces the original image file with the edited image. The server takes the destination
from the image tab's original path, so the client cannot choose another file or directory.

Every save is a **PNG**, whatever the source format was. Editing is offered for every format the
viewer opens, and two consequences follow from the single output format: an **animated GIF flattens**
to the frame that was decoded, and an **SVG rasterizes** at the size it was rendered, losing its
vector nature. Each is replaced by the flattened PNG output.

After a successful save the header names the original file for a few seconds and then clears. The
edits stay live and the tab keeps that original identity, so work can continue and be saved again.

### Unsaved edits

**Done** returns the tab to the viewer without discarding anything: the operation list stays live,
the tab stays marked unsaved, and **Edit image** comes back to exactly the work in progress.

Unsaved edits are real work, so they are not dropped silently the way zoom and pan are. Closing an
image tab that holds them raises the same save-changes dialog an editor tab raises, with **Save**,
**Don't Save**, and **Cancel** (see [[editor-tab]]). **Save** there means what Save means everywhere
in this feature: replace the original file, then close. This covers every close path — the tab's ×
button, `Cmd+W`, and typing `close` or `exit` — and unsaved image edits also hold up `quit`, closing
the last tab, and closing or reloading the browser page (see [[quit-confirmation]]).

An in-progress edit is a live, in-memory view like zoom and pan: it is not persisted, not restored on
`--relaunch`, and not captured by a profile beyond the file a profile already records.

### Tab strip: name and close button

In the tab strip an image tab reads exactly like an ordinary tab — same dot, group bar, active
highlight, and ordering — with two differences:

- **Name.** The tab's name is the image's file name, while its internal label stays distinct
  (`image`, `image-2`, …) so several image tabs can coexist. Per [[tab-label-no-markers]], no type
  marker is appended — the name only.
- **Unsaved marker.** A tab holding unsaved edits shows a small marker beside the name, which
  disappears the moment the edits are saved. This is a **recorded exception** to
  [[tab-label-no-markers]], taken knowingly: with several image tabs open, unsaved work in a tab that
  is not on screen would otherwise be invisible. The marker means unsaved changes only — being in
  edit mode with nothing changed shows nothing — so it never becomes a type marker by another name.
  The editor tab is deliberately not changed to match; it continues to mark unsaved changes only by
  enabling its own save button.
- **Close button.** A close control is shown **right-aligned within the tab, immediately after the
  name**. Clicking it removes that tab without first selecting it; the click does not also trigger
  tab selection. The close button is specific to view tabs (agent tabs continue to close via the
  `close` command).

### Closing

Closing a tab that holds unsaved edits raises the save-changes dialog first (see Unsaved edits).
Once past it, the close button closes a tab **by position**, which need not be the active tab, performing the
same teardown the `close` command does for a non-last tab: the tab is removed from the strip, its
in-memory state is dropped, its registered file is unregistered, and, if it was the active tab,
focus is restored to whichever tab was focused immediately before it became active (falling back
to an adjacent tab if that one no longer exists). Because an image tab owns no shell, agent
session, browser, or workspace, those teardown steps
simply do nothing for it. Closing the last remaining tab quits the app, exactly as the `close`
command does (see `tabs.md`).

### Reordering and grouping

An image tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous within
it (see Tabs → Tab grouping), and can be reordered within its group with the reorder keys like any
other tab — it can never be dragged out of the group it was opened from.
