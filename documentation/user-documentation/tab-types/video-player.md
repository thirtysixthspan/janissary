# Video player

`open <video>` plays a video in its own tab:

```
open clip.mp4
```

The tab shows a compact header with the file's name, size, and location, and the player fills the space below it. The tab is named after the file in the strip and carries a × close button. If that video is already open, `open <video>` focuses the existing tab instead of creating a duplicate.

## Formats that play in a tab

These play in the app:

| Format | Extensions |
|---|---|
| MP4 | `.mp4`, `.m4v` |
| WebM | `.webm` |
| Ogg | `.ogv` |
| QuickTime | `.mov` |

These are recognized but can't be played in the app, so `open` hands them straight to an external player instead — no tab opens:

`.mkv` · `.avi` · `.wmv` · `.flv` · `.mpg` · `.mpeg`

Either way, opening a video does something useful. You'll see a note in the current tab when a file goes to an external player, naming the player it went to.

## Playback controls

Playback uses your platform's standard video controls, shown on the player itself: play and pause, the timeline scrubber, volume, and fullscreen. There are no separate app shortcuts for playback — while the player has focus, the keyboard belongs to those controls.

## Playing while you work in another tab

A playing video keeps playing when you switch to another tab. It isn't paused or rewound, and you'll find it further along the timeline when you come back, along with the volume and playback speed you set.

This means sound can come from a tab you can't see. To stop it, pause the video before you leave the tab, or close the tab.

## Opening in an external player

`open external <video>` hands any video to a player outside the app:

```
open external clip.mp4
```

By default that's **QuickTime Player**. To use a different one, set the `video` entry under `externalViewers` in `.janissary/config.json`:

```json
{
  "externalViewers": { "video": "VLC" }
}
```

Use the application's name as it appears on your system. Setting it to an empty string hands videos to whatever your operating system opens them with. The app reads this at startup, so restart after changing it.

If no player can be launched at all, the app reports the file's path so you can open it yourself.

## When a video won't play

Some files use a format the app recognizes but a codec it can't decode, and some files are simply damaged. When that happens the player is replaced by a short message, the file's full path, and a button offering to open it in your configured player.

Nothing launches on its own — the tab stays put and you decide.

## Lifecycle

A video tab is a live view, not saved state. Playback position belongs to the open tab, not the file: close the tab and open the video again and it starts from the beginning. Video tabs are not restored by `janus --relaunch`, and `profile save` doesn't record them.

Closing a tab — via its × button or `close` — stops playback and removes the view. The file itself is untouched. Only files you've explicitly opened are ever served to the player.

To open a video from the file navigator, double-click it. Holding `Shift` while you double-click sends it to your external player instead — there's nothing to edit as text in a video. See [Opening files and pages](/user-documentation/tab-types/opening-files).
