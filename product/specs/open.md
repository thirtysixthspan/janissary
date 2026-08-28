# Open

The `open` command is a **dispatcher** for handling targets — local files and web addresses: it inspects the target, picks the opener that handles it, and hands the target to it. Every type is handled by its own **opener**; the dispatcher itself knows only enough to tell a **web address** from a **file** and route each to its opener. Core openers handle text files and embedded web pages; bundled tab plugins contribute the rest, currently Markdown, images, and video.

### Open for extension, closed for modification

Opener selection is a lookup. The dispatcher first classifies the target: a **web address** goes to the web opener; otherwise the target is a **file**, and the dispatcher walks an ordered list of registered file openers and picks the first one whose declared extensions include the file's extension. Core openers precede adapters derived from static tab-plugin declarations, and duplicate claims are rejected instead of being decided silently by array position. Resolving a plugin claim activates that plugin lazily. Supporting a new file type is purely additive: register one new opener or plugin declaration that says which extensions it handles. Nothing in the dispatcher or in an existing opener changes — the dispatcher is closed for modification, the registry open for extension.

### Opener

Each opener declares:

- what it **claims** — a set of file **extensions**, or **web addresses** — and
- two ways to present a target: an **external** presentation that hands the target to a program outside the app, and an **inline** presentation that performs an in-app UI action (such as opening a tab).

Both presentations receive the resolved target and whatever application context they need to launch a program or create a tab. An opener can do only these two things, so the effect of opening any target is predictable: it either launches an external program or mounts an in-app view.

Every file opener's external presentation confirms the same way. When the file goes to an application the user configured, the confirmation names that application. When it goes to the operating system's handler instead — because none is configured, or the named one could not be launched — the confirmation says the file was opened in the **default** viewer or player for its kind. When nothing can be launched at all, the file's path is reported in place of a confirmation. An opener with no configurable application skips the first case and starts at the second.

### Dispatch

The command takes optional `external` and `page` keywords and a target:

- `open <target>` selects the **inline** presentation.
- `open external <target>` selects the **external** presentation.

Before dispatch the target is classified as a web address or a file:

- **Web address** — a target with an explicit `http://` or `https://` scheme, or any target preceded by the **`page`** keyword, is handed to the web opener. The `page` keyword also supplies a default `https://` scheme, so a bare address (`open page slashdot.org`) is viewable; only `http`/`https` schemes are accepted.
- **File** — any other target. Relative paths resolve against the active tab's working directory, and the file's extension (case insensitive) is matched against the registered file openers.

The chosen presentation of the selected opener is then invoked.

### `edit` dispatches by file type

`edit <file>` normally bypasses the opener registry entirely and hands the file to the plain-text editor — that bypass is how markdown and extensionless files (`Makefile`, `.gitignore`) get edited. One check runs first: an opener may declare that it edits its own files, and for those extensions `edit` reaches that opener's **edit presentation** instead. The image opener is the only one that does so today, so `edit photo.png` opens the image editor while `edit src/index.ts` and `edit Makefile` still open the plain-text editor.

Resolution reads the opener registry, which is built from static declarations, so asking whether a plugin owns the verb never activates it. One consequence is accepted rather than worked around: **`edit photo.png` can no longer open a PNG as raw text**, and there is no escape hatch for that. A `:line` suffix still parses as it does for any file; an image has no lines, so the editor discards it and the path still opens.

Every existing sender of `edit <path>` reaches the same place without changing: the command line, the quick-open picker, a transcript file link, the transcript line's own open control, and Shift-activation of a row in the file navigator.

Error handling, surfaced in the active tab before any opener runs:

- **No opener for the extension** — when opened from the file navigator, a chooser offers editing
  the file as text or opening it externally; other `open` commands report that the file type is
  unsupported.
- **Missing target or malformed invocation** — a usage message: `open [external] [page] <target>`.
- **Unviewable or malformed web address** — a message reporting the address is invalid (for example, a non-`http`/`https` scheme).
- **File does not exist** — a not-found message. Existence is checked before dispatch, so every file opener may assume the file is present.

The dispatcher resolves the opener and surfaces these errors; the opener owns everything past that point.

An inline view or editor fetches a file through its authenticated registered reference. If that file
is deleted or becomes unreadable after the tab opens, the reference answers with an HTTP error
rather than a successful empty document, so the consuming view can report a load failure without
mistaking missing bytes for real content.

### Wildcards

When the path contains shell wildcard characters, it is treated as a pattern rather than a single file. The pattern is expanded **by the shell** — exactly as it would be on the command line — into the list of files it matches, resolved against the active tab's working directory. `open` then acts on each matched file in turn, applying the same presentation (inline or external) to every one.

- A wildcard `open` acts on **at most 10 files**. Matches are deduplicated and sorted by path; when a pattern matches more than 10, only the first 10 are opened and the rest are skipped, with a note reporting how many were matched. Async plugin openers are awaited one at a time so this order is preserved.
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

## Image plugin opener

The bundled `image` tab plugin contributes an opener for all common image types — including PNG, JPEG, GIF, WebP, BMP, SVG, AVIF, and ICO (case-insensitive) — and implements all three presentations. Its static declaration is available at startup; its behavior activates only on the first matching `open` or `edit`. It claims no command of its own, so `open` and `edit` are the only routes to it.

### `open external <image>`

Hands the image to the operating system's default image viewer (on macOS, Preview), launched detached so it never blocks the app. The image opener has no configurable application of its own, so the confirmation shown in the active tab always names the default viewer. A failure to launch (e.g. no viewer available) is swallowed rather than crashing the app; on platforms without a known viewer, the file path is reported instead.

### `open <image>` — image tab

Opens the image in an **image tab**: a non-agent view tab that displays the image with its metadata and no command bar. The new tab is created and focused like an agent tab (placed within the active tab's group, distinct dot color); it is a live, in-memory view and is not persisted or restored on `--relaunch`. If the image is already open in an image tab, that existing tab is focused instead of opening a duplicate. The image tab — its layout, sizing and zoom, the tab-strip name and close button, how it is closed, and how its bytes are served — is described in [[image-tab]].

### `edit <image>` — image editor

Opens the same image tab, already flipped to its **editor**: a canvas and a geometry toolbar in place of the zoom-and-pan stage. The tab is keyed on the file path exactly as the viewer is, so `edit` on an image that is already open focuses that tab and flips it rather than opening a second one. Saving replaces the original file with the edited PNG. See [[image-tab]].

---

## Video plugin opener

The bundled `video` tab plugin contributes an opener for common video containers (case-insensitive). Its static declaration is available at startup, but its behavior activates only on the first matching `open` or `video` command. It splits containers into two groups:

- **Playable** — MP4, M4V, WebM, OGV, and MOV. These are the containers the app can play in a video tab.
- **External only** — MKV, AVI, WMV, FLV, MPG, and MPEG. These are claimed so that opening one is never reported as an unsupported file type, but they cannot be played in-app; both of their presentations hand the file to an external player.

### The configured player

Which application receives a video is set by the **external viewers** setting (see [[application-config]]), a map keyed by opener name whose `video` entry defaults to QuickTime Player. Clearing the entry means "use the operating system's default handler for the file type". The setting is edited by hand; there is no command to change it.

### `open external <video>`

Hands the video to the configured player, launched detached so it never blocks the app, and confirms in the active tab which player was used. When no player is configured — or the app cannot launch one by name on this platform — the file goes to the operating system's default handler instead, with a correspondingly generic confirmation. If neither can be launched, the file's path is reported instead.

### `open <video>` — video tab

For a **playable** container, opens the video in a **video tab**: a non-agent view tab that plays the file with its metadata and no command bar. The new tab is created and focused like an agent tab (placed within the active tab's group, distinct dot color); it is a live, in-memory view and is not persisted or restored on `--relaunch`. If the video is already open in a video tab, that existing tab is focused instead of opening a duplicate. The video tab is described in [[video-tab]].

For an **external-only** container, no tab opens: the file is handed to the configured player exactly as `open external` does. Opening a video therefore always does something useful, whatever the container.

### `video <path>`

The plugin also contributes `video <path>`. It is a second route into the same opener and has the same relative-path resolution, wildcard expansion, sorted processing, ten-file limit, missing-file errors, transcript attribution, external-only routing, and focus-existing behavior as `open <path>`. Bare `video` prints `Usage: video <path>`.

Because it is a route into one opener rather than into the registry, `video` only opens videos: a file that exists but belongs to another opener is reported as not a video file rather than opened. `video notes.txt` therefore says so instead of opening the plain-text editor, which is what plain `open notes.txt` does. See [[tab-plugins]] for plugin activation and failure behavior.

### File navigator gesture

In a file navigator, the gesture that normally forces the plain-text editor is inverted for a video row: because a binary video has nothing to edit as text, that gesture runs the external presentation and hands the file to the configured player. Plain activation opens the video in the app as usual. See [[file-navigator-tab]].

---

## Audio plugin opener

The bundled `audio` tab plugin contributes an opener for common audio file types (case-insensitive). Its static declaration is available at startup, but its behavior activates only on the first matching `open` or `audio` command. It splits them into two groups:

- **Playable** — MP3, M4A, AAC, WAV, FLAC, OGG, OGA, Opus, and AIFF. These are the file types the app can play in an audio tab.
- **External only** — WMA. Claimed so that opening one is never reported as an unsupported file type, but it cannot be played in-app; both of its presentations hand the file to an external player.

### The configured player

Which application receives an audio file is set by the **external viewers** setting (see [[application-config]]), a map keyed by opener name whose `audio` entry names the application to launch. Clearing the entry means "use the operating system's default handler for the file type". The setting is edited by hand; there is no command to change it.

### `open external <audio>`

Hands the file to the configured player, launched detached so it never blocks the app, and confirms in the active tab which player was used. When no player is configured — or the app cannot launch one by name on this platform — the file goes to the operating system's default handler instead, with a correspondingly generic confirmation. If neither can be launched, the file's path is reported instead.

### `open <audio>` — audio tab

For a **playable** file type, opens the file in the **audio tab**: a non-agent view tab holding a playlist, a player, and the playing track's metadata, with no command bar. Unlike every other view tab there is only ever one of them. If no audio tab is open, one is created and focused like an agent tab (placed within the active tab's group, distinct dot color). If one is already open, the file is appended to the end of its playlist and becomes the playing track — a second `open` never produces a second player. Opening a file the playlist already holds jumps to it rather than queueing it twice. The audio tab is a live, in-memory view and is not persisted or restored on `--relaunch`. It is described in [[audio-tab]].

For an **external-only** file type, no tab opens and nothing is queued: the file is handed to the configured player exactly as `open external` does. Opening an audio file therefore always does something useful, whatever the file type.

### `audio <path>`

The plugin also contributes `audio <path>`. It is a second route into the same opener and has the same relative-path resolution, wildcard expansion, sorted processing, ten-file limit, missing-file errors, transcript attribution, and external-only routing as `open <path>`. Bare `audio` prints `Usage: audio <path>`. Several tracks are queued from the command line with a wildcard rather than with several space-separated paths — a path with no wildcard character is a single literal target.

Because it is a route into one opener rather than into the registry, `audio` only opens audio files: a file that exists but belongs to another opener is reported as not an audio file rather than opened. See [[tab-plugins]] for plugin activation and failure behavior.

### File navigator gestures

In a file navigator, the gesture that normally forces the plain-text editor is inverted for an audio row: because a binary audio file has nothing to edit as text, that gesture runs the external presentation and hands the file to the configured player. Plain activation queues the file in the app as usual.

The plugin also contributes an **Add to playlist** entry to the row context menu for a multi-row selection of audio files, which queues every selected file in order through this same opener. See [[file-navigator-tab]].

---

## Markdown opener

The Markdown opener is contributed by the bundled markdown tab plugin (see [[tab-plugins]]). It claims the `.md` and `.markdown` extensions (case-insensitive) and implements both presentations.

### `open external <file>.md`

Hands the file to the operating system's default viewer, launched detached so it never blocks the app. A failure to launch is swallowed rather than crashing the app, and a short confirmation is shown in the active tab. On platforms without a known viewer, the file path is reported instead.

### `open <file>.md` — markdown tab

Opens the file in a **markdown tab**: a non-agent view tab that renders the file's text as formatted Markdown (headings, lists, tables, fenced code, blockquotes, links) colored by the active application theme, with no command bar. The new tab is created and focused like an agent tab (placed within the active tab's group, distinct dot color); it is a live, in-memory view and is not persisted or restored on `--relaunch`. Opening a file that already has a markdown tab focuses that tab rather than opening a second one. The markdown tab — its layout, scrolling controls, the tab-strip name and close button, how it is closed, and how its text is served — is described in [[markdown-tab]].

---

## Web opener

Web addresses (`http`/`https`) resolve by their own claim rather than by a file extension, and reach whichever bundled plugin claims them — the page plugin (see [[tab-plugins]]). Both presentations are implemented there, as is normalization: an explicit `http`/`https` scheme is kept; a bare address (only possible via the `page` keyword) is given a default `https://`; any other scheme is rejected as invalid. If nothing claims web addresses, `open` reports that there is no viewer for them.

### `open external <url>` — OS browser

Hands the address to the operating system's default browser, launched detached so it never blocks the app, with a short confirmation in the active tab. The `page` keyword and default-scheme rule apply here too (`open external page slashdot.org`). This reuses the same OS-open mechanism as the image opener's external presentation.

### `open <url>` / `open page <address>` — page tab

Opens the address in an embedded **page tab**: a non-agent view tab showing the live web page, with no command bar. The new tab is created and focused exactly like an image tab (placed within the active tab's group, distinct dot color); it is a live, in-memory view and is not persisted or restored on `--relaunch`. Opening an address that a page tab is already showing focuses that tab instead of embedding the same site twice, the same de-duplication every plugin view gets. The page tab — its domain name, what renders, and how it is closed — is described in [[embedded-web-page]].
