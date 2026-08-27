# Audio player

`audio <path>` plays an audio file in a tab:

```
audio track.mp3
```

`open track.mp3` does the same thing. The tab shows the playing track's name, size, and location in a header, your platform's own audio controls below that, and the playlist filling the rest of the tab.

## One tab, one playlist

<img class="agent-float" src="/agents/fariz-south-west.png" alt="" />

Unlike every other viewer, there is only ever one audio tab. Open a second file while it's there and that file joins the end of the playlist and starts playing, instead of opening a tab of its own. A session builds up a queue rather than a row of tabs.

Open a whole folder's worth at once with a wildcard, and each match queues in sorted order with the last one playing:

```
audio ~/music/*.flac
```

The same 10-match limit applies as anywhere else you [open files](/user-documentation/tab-types/opening-files#wildcards). Opening a file the playlist already holds jumps to it rather than queueing it twice.

The tab is always named `audio`, whatever is playing.

## Formats that play in a tab

These play in the app:

| Format | Extensions |
|---|---|
| MP3 | `.mp3` |
| AAC | `.m4a`, `.aac` |
| WAV | `.wav` |
| FLAC | `.flac` |
| Ogg | `.ogg`, `.oga`, `.opus` |
| AIFF | `.aiff` |

`.wma` is recognized but can't be played in the app, so it goes straight to an external player and no tab opens.

## Playback controls

<img class="agent-float left" src="/agents/hakim-south-east.png" alt="" />

The header carries five transport buttons, and each one has a key binding that works while the audio tab is the tab you're looking at. The timeline, scrubbing, and volume belong to the player's own controls underneath.

| Key | Action |
|---|---|
| `Space` | Play or pause |
| `←` / `→` | Back or forward ten seconds in the current track |
| `Shift+←` / `Shift+→` | Previous or next track |

Seeking stops at either end of the track rather than spilling into its neighbor. Switch to another tab and the keys go back to that tab, so a hidden audio tab never swallows your arrow keys.

Each track starts playing on its own as it becomes current. If your browser blocks playback with sound, the track waits paused instead, ready for the play button.

## Work the playlist

Click any row to jump to that track. Each row carries its own remove control.

Removing the track that's playing moves you straight on to the next one. Removing any other row leaves playback alone. Remove the last row and the tab stays open on an empty playlist reading `No tracks queued`, ready to be refilled.

The playlist plays straight through and stops on the last track. Nothing wraps around and nothing is cleared, so you can replay it or step back through it by hand.

## Queue files from the file navigator

Select several audio files in a [file navigator](/user-documentation/tab-types/file-navigator), right-click one of them, and choose **Add to playlist** to queue the whole selection at once. The entry only appears when every row you selected is an audio file.

## Keep listening while you work

<img class="agent-float" src="/agents/idris-south.png" alt="" />

A playing track keeps playing when you switch away, including while the audio tab sits in an unfocused split pane. Sound can therefore come from a tab you can't see. To stop it, pause before you leave, or close the tab.

## Open in an external player

`open external <audio>` hands a file to a player outside the app instead:

```
open external track.mp3
```

By default that's whatever your operating system opens audio with. To name a player, add an `audio` entry under `externalViewers` in [`.janissary/config.json`](/user-documentation/getting-started/startup#configuration):

```json
{
  "externalViewers": { "audio": "VLC" }
}
```

Use the application's name as it appears on your system. The app reads this at startup, so restart after changing it. If no player can be launched at all, the app reports the file's path so you can open it yourself.

Holding `Shift` while you double-click an audio row in the file navigator sends it to that player too.

## When a track won't play

A file can use a codec the app can't decode, or simply be damaged. When that happens the track is dropped from the playlist and the next one starts, so one bad file never stalls a queue.

The drop is reported to the [notifications](/user-documentation/tab-types/notifications) feed and nowhere else, as `Dropped <name> — it could not be played.` Like every notification, the line is dropped when no notifications tab is open.

## Lifecycle

An audio tab is a live view, not saved state. The playlist belongs to the open tab, not to the files: close it and open the same track again and you start a fresh queue from the beginning. Audio tabs are not restored by `janus --relaunch`, and `profile save` doesn't record them.

Closing the tab stops playback and releases every file it was serving. Only files you've explicitly opened are ever served to the player.
