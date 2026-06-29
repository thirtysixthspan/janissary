# Open

The `open` command is a **dispatcher** for handling targets — local files and web addresses: it inspects the target, picks the opener that handles it, and hands the target to it. Every type is handled by its own **opener**; the dispatcher itself knows only enough to tell a **web address** from a **file** and route each to its opener. Images and embedded web pages are the supported types.

### Open for extension, closed for modification

Opener selection is a lookup. The dispatcher first classifies the target: a **web address** goes to the web opener; otherwise the target is a **file**, and the dispatcher walks an ordered list of registered file openers and picks the first one whose declared extensions include the file's extension. Supporting a new file type is purely additive: register one new opener that declares the extensions it handles and how to display them. Nothing in the dispatcher or in any existing opener changes — the dispatcher is closed for modification, the registry open for extension.

### Opener

Each opener declares:

- what it **claims** — a set of file **extensions**, or **web addresses** — and
- two ways to present a target: an **external** presentation that hands the target to a program outside the app, and an **inline** presentation that performs an in-app UI action (such as opening a tab).

Both presentations receive the resolved target and whatever application context they need to launch a program or create a tab. An opener can do only these two things, so the effect of opening any target is predictable: it either launches an external program or mounts an in-app view.

### Dispatch

The command takes optional `external` and `page` keywords and a target:

- `open <target>` selects the **inline** presentation.
- `open external <target>` selects the **external** presentation.

Before dispatch the target is classified as a web address or a file:

- **Web address** — a target with an explicit `http://` or `https://` scheme, or any target preceded by the **`page`** keyword, is handed to the web opener. The `page` keyword also supplies a default `https://` scheme, so a bare address (`open page slashdot.org`) is viewable; only `http`/`https` schemes are accepted.
- **File** — any other target. Relative paths resolve against the active tab's working directory, and the file's extension (case insensitive) is matched against the registered file openers.

The chosen presentation of the selected opener is then invoked.

Error handling, surfaced in the active tab before any opener runs:

- **No opener for the extension** — a message stating the file type is unsupported.
- **Missing target or malformed invocation** — a usage message: `open [external] [page] <target>`.
- **Unviewable or malformed web address** — a message reporting the address is invalid (for example, a non-`http`/`https` scheme).
- **File does not exist** — a not-found message. Existence is checked before dispatch, so every file opener may assume the file is present.

The dispatcher resolves the opener and surfaces these errors; the opener owns everything past that point.

### Wildcards

When the path contains shell wildcard characters, it is treated as a pattern rather than a single file. The pattern is expanded **by the shell** — exactly as it would be on the command line — into the list of files it matches, resolved against the active tab's working directory. `open` then acts on each matched file in turn, applying the same presentation (inline or external) to every one.

- A wildcard `open` acts on **at most 10 files**. When a pattern matches more than 10, only the first 10 (in the shell's match order) are opened and the rest are skipped, with a note reporting how many were matched.
- A pattern that matches nothing reports that there were no matching files.
- Each matched file is still dispatched individually, so the per-file rules above apply to each — an unsupported type among the matches is reported and skipped without stopping the others.

A path with no wildcard characters is always a single literal target (so a name containing spaces is opened as-is, not split). Wildcards apply to file paths only; a web address is never treated as a pattern.

### `open` command

`open [external] [page] <target>` — view a file or web page with the opener for its type.

- `open <path>` — open a file **in the app** (the inline presentation; for images, a new image tab).
- `open <url>` / `open page <address>` — open a web page **in the app** (an embedded page tab; see [[embedded-web-page]]).
- `open external <path>` — hand a file to an **external program** (for images, the OS image viewer).
- `open external <url>` / `open external page <address>` — open a web address in the **OS default browser**.

Malformed invocations return a usage message; an unrecognized file type reports that no opener is registered.

---

## Image opener

The first opener handles all common image types — including PNG, JPEG, GIF, WebP, BMP, SVG, AVIF, and ICO — and implements both presentations.

### `open external <image>`

Hands the image to the operating system's image viewer (on macOS, Preview), launched detached so it never blocks the app. A failure to launch (e.g. no viewer available) is swallowed rather than crashing the app, and a short confirmation is shown in the active tab. On platforms without a known viewer, the file path is reported instead.

### `open <image>` — image tab

Opens a new **image tab**: a non-agent tab that displays the image together with its metadata, and has no command bar. The tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to the new image tab.

Unlike an agent tab, an image tab has no shell, agent session, browser, transcript, or command history, and no persisted agent state. It is a **live, in-memory view** — like browser windows (see Browser), it is not saved and is not restored on `--relaunch`.

### Image tab data

An image tab is distinguished from an ordinary tab by a **view kind** marking it as an image view. Alongside it the tab carries the data the view needs:

- **name** — the file's name.
- **location** — the file's full path.
- **size** — the file's size, human-readable.
- a **reference** the web client can load to fetch the image bytes (see Serving opened files).

The image's pixel dimensions are not part of this data; the client measures them from the loaded image and lays the view out accordingly (see Image sizing).

### Serving opened files

The web client cannot read a local file path directly, and the app's web server otherwise serves only its own bundled assets. Opening an image therefore **registers** the file, which adds it to an allow-list and yields a reference the client can request. The server answers that reference — subject to the same origin/authentication checks as the rest of the app — by streaming the bytes of that one registered file, with a content type derived from its extension. Only files the user has explicitly opened are served; arbitrary paths are never reachable, so this adds no filesystem-traversal surface. A file's registration is dropped when its image tab is closed.

### Image tab layout

An image tab's body has no command bar and no transcript. When the active tab is an image view, the app renders the image view in place of the usual transcript-and-command-bar body; every other tab renders unchanged. Tab switching, scrolling, and the route/history overlays continue to key off the active tab as before.

The image view shows, stacked top to bottom:

1. **Metadata** — the image's name, size, and location, in a compact header.
2. **The image** itself, filling the space beneath the metadata.

### Image sizing

The image is fit to the available tab area according to its **orientation**, measured from the image's natural dimensions once loaded:

- **Landscape** (width greater than height) → the image occupies the **full width** of the available tab space.
- **Portrait** (height greater than or equal to width) → the image occupies the **full remaining height** beneath the metadata header.

In both cases only one dimension is constrained and the other follows, preserving the image's aspect ratio. The fit is recomputed when the image loads and when the tab is resized.

### Tab strip: name and close button

In the tab strip an image tab reads exactly like an ordinary tab — same dot, group bar, active highlight, and ordering — with two differences:

- **Name.** The tab's name is always `image` (the file name is shown in the tab's metadata header, not in the strip). Per [[tab-label-no-markers]], no type or status marker is appended — the name only.
- **Close button.** A close control is shown **right-aligned within the tab, immediately after the name**. Clicking it removes that tab without first selecting it; the click does not also trigger tab selection. The close button is specific to view tabs (agent tabs continue to close via the `close` command).

### Closing an image tab

The close button closes a tab **by position**, which need not be the active tab, performing the same teardown the `close` command does for a non-last tab: the tab is removed from the strip, its in-memory state is dropped, its registered file is unregistered, and an adjacent tab is selected. Because an image tab owns no shell, agent session, browser, or workspace, those teardown steps simply do nothing for it. Closing the last remaining tab falls back to opening a fresh default tab, exactly as the `close` command does.

### Reordering and grouping

An image tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous within it (see Tabs → Tab grouping), and can be reordered within its group with the reorder keys like any other tab — it can never be dragged out of the group it was opened from.

---

## Web opener

The web opener handles **web addresses** (`http`/`https`) rather than a file extension, and implements both presentations. The address is normalized first: an explicit `http`/`https` scheme is kept; a bare address (only possible via the `page` keyword) is given a default `https://`; any other scheme is rejected as invalid.

### `open external <url>` — OS browser

Hands the address to the operating system's default browser, launched detached so it never blocks the app, with a short confirmation in the active tab. The `page` keyword and default-scheme rule apply here too (`open external page slashdot.org`). This reuses the same OS-open mechanism as the image opener's external presentation.

### `open <url>` / `open page <address>` — page tab

Opens the address in an embedded **page tab**: a non-agent view tab showing the live web page, with no command bar. The new tab is created and focused exactly like an image tab (placed within the active tab's group, distinct dot color); it is a live, in-memory view and is not persisted or restored on `--relaunch`. The page tab — its numbered `<n>) <domain>` label, what renders, and how it is closed — is described in [[embedded-web-page]].
