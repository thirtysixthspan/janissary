# Video Tab

A **video tab** is the view contributed by the bundled video tab plugin. It plays a single video
opened with the `open` command (see Open → Video opener). It is a non-agent **view tab**: it shows the
video and its metadata in place of the usual transcript and command bar, and is controlled by the
player's own transport controls rather than a command line. The shared plugin lifecycle is specified
in [[tab-plugins]].

A video tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to
the new video tab. Opening a video that is already showing in a video tab focuses that tab instead
of opening a duplicate.

Unlike an agent tab, a video tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — it is not saved, is not
restored on `--relaunch`, and is not recorded in or reopened by a profile.

### Video tab data

A video tab uses the generic plugin view envelope, identifying the `video` plugin and its exact
payload schema version. Its plugin-owned payload carries only the data the video view needs:

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
are served; arbitrary paths are never reachable. The reference is owned by the plugin tab and is
unregistered when that tab closes. Reopening the same file focuses the existing plugin instance
before another reference or payload is created.

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
same volume and playback rate.

A playing video **keeps playing while its tab is not the focused one**. It is not paused, stopped, or
rewound when focus moves elsewhere; it goes on advancing in the background, audio included, and is
found further along the timeline on return. This is deliberate: a video is worth listening to while
working in another tab. The consequence is that sound can come from a tab that is not on screen — to
stop it, pause the video before leaving the tab, or close the tab, which ends playback outright.

Playback also continues while the tab is merely off to one side: a video shown in one pane of a split
view plays whether or not that pane holds the keyboard focus.

Playback state is still live and in-memory: it belongs to the open tab, not to the file. Opening the
same file again after closing its tab starts from the beginning, and nothing about playback is
persisted or restored on `--relaunch`.

### Capturing a frame

The metadata header carries a **capture** control that writes the frame currently on screen to an
image file beside the video. The capture is taken at the video's own full resolution, not the size
the tab happens to be showing it at, so shrinking the window does not shrink the result.

The file is named after the video with a numbered suffix and a `.png` extension: capturing from
`clip.mp4` writes `clip.shot-1.png`, then `clip.shot-2.png`, and so on. Numbering always starts at
one and takes the lowest name not already on disk, so repeated captures accumulate instead of
overwriting each other, and deleting an earlier shot frees its number for reuse. The result is an
ordinary image file that can be opened in the app like any other.

The name that was written is shown briefly in the header as confirmation. Nothing else is reported,
and the capture is not opened automatically.

The user never chooses the destination. The file always lands in the directory the video was opened
from, under the name described above — there is no prompt, no format choice, and no setting. The
control is offered only while the player is showing; there is nothing to capture from a video that
could not be decoded, and none at all for a container that only ever opens in an external player.

### When the video cannot be played

A container in the playable set can still hold a codec the app cannot decode, and a file can be
corrupt. When playback fails, the player is replaced in place by a short message that the video
cannot be played in the app, the file's full path, and a button offering to **open it in the
configured player** (named on the button, or a generic "open externally" when no player is
configured). Nothing launches on its own — the tab stays open and the user decides. Pressing the
button runs the video opener's external presentation for that file, exactly as `open external`
would.

The client video code is loaded only when a video plugin tab first mounts. A chunk, activation,
payload-validation, or render failure stays inside the tab, disables the video plugin until process
restart, and reports `Tab plugin "video" disabled: <reason>.` to the live origin and any already-open
notifications feed. It does not stop other tabs or trigger a second load attempt.

### Tab strip, closing, reordering

In the tab strip a video tab reads like any other view tab: same dot, group bar, active highlight,
and ordering, named after the file, with a close control right-aligned within the tab. Closing,
reordering, and grouping behave exactly as they do for an image tab (see [[image-tab]]) — closing
drops the tab's in-memory state and unregisters its served file, and the tab can never be moved out
of the group it was opened from.
