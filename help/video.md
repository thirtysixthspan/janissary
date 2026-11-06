### video

Open a video in the bundled video tab. It accepts the same paths and wildcards as `open`. `video snapshot` saves one frame of a video to an image file instead, without opening a tab.

**Usage**

`video <path>`

`video snapshot <video path> at <time> <destination path>`

**Use cases**

- Watch a video file in its own tab.
- Open matching video files from a wildcard.
- Save the frame at a given time as a `.png` or `.jpg`. The time is seconds (`12.5`), `m:ss`, or `h:mm:ss`. The destination's directory must exist and the file must not. Needs `ffmpeg` on the `PATH`.

**Examples**

- `video clip.mp4` opens a video tab.
- `video recordings/*.mov` opens matching video files.
- `video snapshot clip.mp4 at 1:05 frames/title.png` saves the frame at 1 minute 5 seconds.
