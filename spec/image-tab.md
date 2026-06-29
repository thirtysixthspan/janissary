# Image Tab

An **image tab** displays a single image opened with the `open` command (see Open → Image opener).
It is a non-agent **view tab**: it shows the image and its metadata in place of the usual
transcript and command bar, and is controlled by direct interaction (zoom, pan, and the scroll wheel)
rather than a command line.

An image tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves
to the new image tab.

Unlike an agent tab, an image tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — like browser windows
(see Browser), it is not saved and is not restored on `--relaunch`.

### Image tab data

An image tab is distinguished from an ordinary tab by a **view kind** marking it as an image view.
Alongside it the tab carries the data the view needs:

- **name** — the file's name.
- **location** — the file's full path.
- **size** — the file's size, human-readable.
- a **reference** the web client can load to fetch the image bytes (see Serving the image).

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

### Layout

An image tab's body has no command bar and no transcript. When the active tab is an image view, the
app renders the image view in place of the usual transcript-and-command-bar body; every other tab
renders unchanged. Tab switching, scrolling, and the route/history overlays continue to key off the
active tab as before.

The image view shows, stacked top to bottom:

1. **Metadata** — the image's name, size, and location, in a compact header.
2. **The image** itself, filling the space beneath the metadata.

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

### Tab strip: name and close button

In the tab strip an image tab reads exactly like an ordinary tab — same dot, group bar, active
highlight, and ordering — with two differences:

- **Name.** The tab's name is always `image` (the file name is shown in the tab's metadata header,
  not in the strip). Per [[tab-label-no-markers]], no type or status marker is appended — the name
  only.
- **Close button.** A close control is shown **right-aligned within the tab, immediately after the
  name**. Clicking it removes that tab without first selecting it; the click does not also trigger
  tab selection. The close button is specific to view tabs (agent tabs continue to close via the
  `close` command).

### Closing

The close button closes a tab **by position**, which need not be the active tab, performing the
same teardown the `close` command does for a non-last tab: the tab is removed from the strip, its
in-memory state is dropped, its registered file is unregistered, and an adjacent tab is selected.
Because an image tab owns no shell, agent session, browser, or workspace, those teardown steps
simply do nothing for it. Closing the last remaining tab falls back to opening a fresh default tab,
exactly as the `close` command does.

### Reordering and grouping

An image tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous within
it (see Tabs → Tab grouping), and can be reordered within its group with the reorder keys like any
other tab — it can never be dragged out of the group it was opened from.
