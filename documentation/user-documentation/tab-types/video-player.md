# Video player

<img class="agent-float" src="/agents/tahir-south.png" alt="" />

`open <video>` plays a video in its own tab:

```
open clip.mp4
video clip.mp4
```

`video <path>` is the same thing under another name, and takes the same paths and wildcards `open` does.

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

The video starts playing as soon as the tab opens — you don't have to click play. If your browser blocks playback with sound, the video just waits paused instead, ready for the play button.

Only the tab you're actually looking at starts itself. A video tab that comes back behind another one when you reload the page stays paused, so a session holding several videos never starts them all at once, and switching to a video tab later never starts it either. A video you paused stays paused.

Playback uses your platform's standard video controls, shown on the player itself: play and pause, the timeline scrubber, volume, and fullscreen. There are no separate app shortcuts for playback — while the player has focus, the keyboard belongs to those controls.

## Playing while you work in another tab

<img class="agent-float left" src="/agents/yusuf-south-west.png" alt="" />

A playing video keeps playing when you switch to another tab. It isn't paused or rewound, and you'll find it further along the timeline when you come back, along with the volume and playback speed you set.

This means sound can come from a tab you can't see. To stop it, pause the video before you leave the tab, or close the tab. A video in one pane of a split view plays whether or not that pane has the keyboard focus.

## Capture a still frame

The camera button in the tab header saves the frame you're looking at as a PNG next to the video file:

```
clip.mp4  →  clip.shot-1.png
             clip.shot-2.png
```

Frames are captured at the video's full resolution, whatever size the tab is. Each capture takes the next free number, so pressing the button repeatedly builds up a set instead of overwriting one file. The name it used appears briefly in the header.

You can't choose where it goes or what it's called — the file always lands beside the video. Open one like any other image: `open clip.shot-1.png`.

The button only appears while the video is playable. There's nothing to capture from a file that wouldn't decode, or from a format that opens in an external player.

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

Use the application's name as it appears on your system. Setting it to an empty string hands videos to whatever your operating system opens them with. The map you write replaces the built-in one rather than adding to it, so list every viewer you want to set in the one object. The app reads this at startup, so restart after changing it.

If no player can be launched at all, the app reports the file's path so you can open it yourself.

## When a video won't play

<img class="agent-float" src="/agents/orhan-south.png" alt="" />

Some files use a format the app recognizes but a codec it can't decode, and some files are simply damaged. When that happens the player is replaced by a short message, the file's full path, and a button offering to open it in your configured player.

Nothing launches on its own — the tab stays put and you decide.

## Lifecycle

A video tab is a live view, not saved state. Playback position belongs to the open tab, not the file: close the tab and open the video again and it starts from the beginning. Video tabs are not restored by `janus --relaunch`.

A [profile](/user-documentation/automation/profiles) does record an open video tab, by its file. Launching that profile reopens the video the same way `open` would, from the beginning — nothing about playback is saved.

Closing a tab — via its × button or `close` — stops playback and removes the view. The file itself is untouched. Only files you've explicitly opened are ever served to the player.

To open a video from the file navigator, double-click it. Holding `Shift` while you double-click sends it to your external player instead — there's nothing to edit as text in a video. See [Opening files and pages](/user-documentation/tab-types/opening-files).
