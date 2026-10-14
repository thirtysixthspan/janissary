# Play a file

<img class="agent-float" src="/agents/orhan-south-west.png" alt="" />

Use `play <file>` to open a playable file in the tab for its type:

```
play devbox
play clip.mp4
play song.mp3
```

`play` accepts one path, including a path with spaces. It doesn't expand wildcards. The file extension selects its player: recordings open in an asciicast tab, video in a video tab, and audio in the audio tab. An external-only video or audio format goes to its configured player instead. See [Opening files and pages](/user-documentation/tab-types/opening-files) for supported formats and viewer settings.

## Find a session recording

<img class="agent-float left" src="/agents/hamza-south-east.png" alt="" />

If the path you give doesn't exist and the target has no extension or ends in `.cast`, `play` looks for a recording in the project's recordings directory. It uses the target's filename without a `.cast` suffix, so `play devbox` and `play devbox.cast` search for the same session. The newest recording for that session wins. If there is no session recording, an exactly named `<name>.cast` file can match instead.

An existing path is checked for playback as given before recording lookup begins. A target with another extension, such as `play missing.mp4`, is treated as that file type and never falls back to a session recording. A session name only matches its full name, so `play devbox` won't select a recording for `devbox-2`.

For details about the recording tab and its controls, see [Recording player](/user-documentation/tab-types/recording-player).

## Fix playback errors

`play` reports errors in the transcript where you typed the command:

| Message | What to do |
|---|---|
| `Usage: play <file>.` | Add a file path or recording name. |
| `play: <file>: not a playable file` | Use a file type with a player. A file with a non-playable extension is refused even if it doesn't exist. |
| `play: <path>: no such file` | Check the path or recording name. Janissary couldn't find the file or a matching session recording. |

The error includes the resolved path for a missing file. For example, `play unknown` reports the path it checked under the active tab's working directory.
