# Audio Tab

An **audio tab** is the persistent view contributed by the bundled audio plugin. It plays a **playlist** of audio files opened with `open <path>` or `audio <path>` (see Open → Audio plugin opener). It is a non-agent **view tab**: it shows the playing track's metadata, a player, and the queue in place of the usual transcript and command bar.

Unlike every other view tab, an audio tab is a **singleton**. There is one player, and it owns a queue rather than a file: opening a second audio file while the tab is open appends that file to the end of the queue and jumps to it instead of opening a second tab. A session therefore accumulates a playlist rather than a row of tabs. Opening several files in turn — which is what a wildcard such as `open *.mp3` does, dispatching each match in sorted order — builds the queue in that order and leaves the last one playing. Opening a file the queue already holds jumps to it rather than queueing it twice.

The tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to it. It has no shell, agent session, browser, transcript, or command history, and no persisted agent state. It is a **live, in-memory view** — the playlist is not saved, is not restored on `--relaunch`, and is not recorded in or reopened by a profile.

### Audio tab data

An audio tab uses the generic **plugin** view kind and an envelope identifying plugin `audio` and payload schema version 1. Its versioned payload carries the queue and which entry of it is playing:

- the **ordered track list** — each entry's file name, full path, and a reference the web client can load to fetch its bytes.
- the **current entry**, or nothing at all when the queue is empty.
- the **size** of the current track, human-readable.

The queue is the server's record. The client decides only which existing entry to move to; it never says what the playlist contains, and every path it names is checked against the queue the server holds. Transport state — position, paused, volume — belongs to the client and is never sent to the server.

### Serving the audio

A track's bytes are served the same way a video's are: queueing a track **registers** it, which adds it to an allow-list and yields a reference the client can request, subject to the same origin and authentication checks as the rest of the app. Only files the user has explicitly opened are served. Every reference the playlist ever registered — including those added by later appends — belongs to the audio tab and is unregistered when that tab closes, including plugin-failure teardown.

Audio serving honors **partial requests** exactly as video serving does, which is what makes seeking within a track responsive.

### Layout

An audio tab's body has no command bar and no transcript. It shows, stacked top to bottom:

1. **Metadata and transport** — the current track's name, size, and location, the five transport controls, and the Split action at the right edge when available.
2. **The player** — the platform's native audio controls, supplying the timeline, scrubbing, and volume.
3. **The playlist**, filling the remaining space: one row per queued track, showing its file name, with the playing entry marked.

The tab is **dockable into either sidebar** through the host's dock control. Docked, the header lays itself out for the narrower frame, dropping the location so the transport controls stay reachable.

### Transport controls and key bindings

Five actions drive playback, available both as buttons in the header and as key bindings while the audio tab is the visible one:

- **Play/pause** — Space.
- **Seek backward** and **seek forward** — `←` and `→`, ten seconds each way. A seek clamps at either end of the current track rather than changing track.
- **Previous track** and **next track** — `Shift+←` and `Shift+→`.

Because a hidden tab stays mounted, the bindings answer only while the audio tab is on screen; an audio tab behind another tab, or in the other split pane, ignores them.

### Playlist behavior

Clicking a playlist row makes that track the playing one. Each row carries a **remove** control.

The playlist **plays straight through and stops on the last track**. When the final entry finishes, playback stops and the playlist and its selection are left exactly as they are, ready to be replayed or advanced by hand. There is no wrap-around and nothing is cleared.

**Removing the playing track advances to the next one**: the entry disappears and the following track starts playing. Removing an entry that is not playing never disturbs playback. Removing the last remaining entry stops playback and leaves the tab open on an empty playlist, reading `No tracks queued` where the player was — the tab is never closed on the user's behalf, since a queue is easy to refill.

The tab is always labeled **audio**, regardless of which track is playing.

### Playback survives a tab switch

Leaving an audio tab does not disturb its player. A playing track **keeps playing while its tab is not the focused one** — while another tab is on screen, while the tab is docked into a sidebar behind another entry, and while it sits in an unfocused split pane. Sound can therefore come from a tab that is not on screen; to stop it, pause before leaving, or close the tab, which ends playback outright.

Playback state is live and in-memory: it belongs to the open tab, not to the file. Closing the tab and opening the same file again starts a fresh queue from the beginning.

### When a track cannot be played

A container in the playable set can still hold a codec the app cannot decode, and a file can be corrupt. When the player reports a decode failure for an entry, that entry is **dropped from the playlist and the next track starts**. One bad file can never stall a queue, and playback is not interrupted to ask about it.

The drop is reported to the **notifications feed** and nowhere else: the player itself shows nothing, and no line is written to the originating transcript. As with every notification, the line is dropped when no notifications feed is open — a dropped track never conjures the feed into existence. When the feed is open the line always appears, including while the audio tab itself is the one the user is watching (see [[notifications]]).

A decode failure is a normal media outcome and does not disable the plugin. Neither does a select or remove request the plugin considers malformed, or one naming a track the queue does not hold: it is refused and the tab keeps working. By contrast, a rejected or timed-out plugin chunk, incompatible payload schema, render exception, or server plugin failure disables the audio plugin, closes the audio tab, and reports the standard plugin failure message. See [[tab-plugins]].

### Tab strip, closing, reordering

In the tab strip an audio tab reads like any other view tab: same dot, group bar, active highlight, and ordering, labeled **audio**, with a close control right-aligned within the tab. Closing, reordering, and grouping behave exactly as they do for a video tab (see [[video-tab]]) — closing drops the queue and unregisters every file it served, and the tab can never be moved out of the group it was opened from.
