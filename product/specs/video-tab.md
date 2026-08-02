# Video Tab

A **video tab** plays a single video opened with the `open` command (see Open → Video opener).
It is a non-agent **view tab**: it shows the video and its metadata in place of the usual transcript
and command bar, and is controlled by the player's own transport controls rather than a command line.

A video tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to
the new video tab. Opening a video that is already showing in a video tab focuses that tab instead
of opening a duplicate.

Unlike an agent tab, a video tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — it is not saved, is not
restored on `--relaunch`, and is not recorded in or reopened by a profile.

### Video tab data

A video tab is distinguished from an ordinary tab by a **view kind** marking it as a video view.
Alongside it the tab carries the data the view needs:

- **name** — the file's name, which is also the tab's name in the tab strip.
- **location** — the file's full path.
- **size** — the file's size, human-readable.
- a **reference** the web client can load to fetch the video bytes (see Serving the video).
- the **configured player** — the name of the external application the video opener would hand this
  file to, so the view can name it when playback fails.

### Serving the video

The video's bytes are served the same way an image tab's are: opening the file **registers** it,
which adds it to an allow-list and yields a reference the client can request, subject to the same
origin and authentication checks as the rest of the app. Only files the user has explicitly opened
are served; arbitrary paths are never reachable.

Video serving additionally honors **partial requests**. When the player asks for a specific byte
range — which is how seeking works — the server answers just that window rather than the whole
file, reporting which bytes it sent and how large the file is. A range that falls outside the file
is rejected as unsatisfiable. A request with no range still returns the whole file, so images,
Markdown, and the editor are served exactly as before. This is what makes scrubbing a long video
responsive, and what keeps a multi-gigabyte file from being read into memory to serve it.

### Layout

A video tab's body has no command bar and no transcript. It shows, stacked top to bottom:

1. **Metadata** — the video's name, size, and location, in a compact header, with the Split action
   at the right edge when available.
2. **The player** itself, filling the space beneath the metadata and fitted to it, preserving the
   video's aspect ratio.

### Playback

Playback uses the platform's **native video controls** — play/pause, the timeline scrubber, volume,
and fullscreen — shown on the player itself. There is no custom transport UI and no tab-level
playback shortcuts; while the player has focus, the keyboard belongs to the native controls.

### Playback survives a tab switch

Leaving a video tab does not disturb its player. Switching to another tab and back returns the video
exactly as it was left — the same position on the timeline, the same paused or playing state, and the
same volume and playback rate. A video that was playing when the tab lost focus is still playing when
it regains it, having advanced in the meantime.

Playback state is still live and in-memory: it belongs to the open tab, not to the file. Opening the
same file again after closing its tab starts from the beginning, and nothing about playback is
persisted or restored on `--relaunch`.

### When the video cannot be played

A container in the playable set can still hold a codec the app cannot decode, and a file can be
corrupt. When playback fails, the player is replaced in place by a short message that the video
cannot be played in the app, the file's full path, and a button offering to **open it in the
configured player** (named on the button, or a generic "open externally" when no player is
configured). Nothing launches on its own — the tab stays open and the user decides. Pressing the
button runs the video opener's external presentation for that file, exactly as `open external`
would.

### Tab strip, closing, reordering

In the tab strip a video tab reads like any other view tab: same dot, group bar, active highlight,
and ordering, named after the file, with a close control right-aligned within the tab. Closing,
reordering, and grouping behave exactly as they do for an image tab (see [[image-tab]]) — closing
drops the tab's in-memory state and unregisters its served file, and the tab can never be moved out
of the group it was opened from.
