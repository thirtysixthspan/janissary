# `video snapshot <video path> at <time> <destination path>`

**Complexity: 5/10** — a new subcommand on the video plugin's existing `video` command: a pure argument parser, a small server-side frame extractor that runs `ffmpeg`, and the validation and reporting around it. The plugin layer already spawns an external tool (the diff plugin runs `git` through `node:child_process`), so this adds no new architecture. The care is in path handling, in keeping the extraction off the plugin's 5-second handler budget, and in reporting every failure as a transcript line rather than a plugin failure.

Today a still frame can only be taken from an open video tab: the header's capture control draws the decoded frame in the browser and the server writes it beside the video as `<base>.shot-<n>.png`. There is no way to pick a timestamp or a destination, and nothing a command or script can drive. The frame only exists in the browser's decoder, so a command that works without an open tab needs a server-side decoder; `ffmpeg` is the standard one and is what this uses.

## Goal

`video snapshot <video path> at <time> <destination path>` writes the frame at `<time>` in the video to `<destination path>` as an image, without opening a tab. `<time>` accepts plain seconds (`12`, `12.5`), `m:ss`, and `h:mm:ss`, each with an optional fraction on the seconds. Relative paths resolve against the invoking tab's working directory, and `~` expands to the home directory. The destination must end in `.png`, `.jpg`, or `.jpeg`, its directory must exist, and it must not already exist — the command never overwrites a file. On success the tab's transcript says where the frame was written; every failure is a transcript line naming the problem. Every other `video` argument behaves exactly as before.

## Approach

- **Parse pure** (`src/plugins/video/snapshot-parse.ts`). `isSnapshotArgument(argument)` answers whether the first word is `snapshot`. `parseSnapshotArgument(argument)` splits the rest on whitespace and finds the first `at` that is followed by a valid time and at least one more word: the words before it are the video path, the words after the time are the destination. Paths with spaces therefore work unquoted. It returns `{ video, time, seconds, destination }` or `{ error }` with the usage line. `parseTimestamp(text)` turns `ss[.f]`, `m:ss[.f]`, `h:mm:ss[.f]` into seconds, refusing minutes or seconds of 60 or more in a non-leading field.
- **Extract** (`src/plugins/video/snapshot-ffmpeg.ts`). `extractFrame(video, seconds, destination)` runs `ffmpeg -hide_banner -loglevel error -nostdin -n -ss <seconds> -i <video> -frames:v 1 <destination>` through `execFile` (no shell) with a time limit, resolving on exit 0 and rejecting with the error and its stderr otherwise. Both paths are absolute by then, so neither can be read as an `ffmpeg` option.
- **Validate and run** (`src/plugins/video/snapshot.ts`). `startSnapshot(request, capabilities, extract = extractFrame)` resolves both paths against `originTab().cwd`, refuses a remote tab (its paths belong to another machine), and synchronously rejects a missing video, a destination with the wrong extension, a missing destination directory, and an existing destination. It then starts the extraction and returns its promise without the command awaiting it, so a slow decode never counts against the handler deadline. When the extraction settles it notes the outcome: the written path on success; "no frame" when `ffmpeg` exited cleanly but wrote nothing (a time past the end); "ffmpeg is not installed" for `ENOENT`; otherwise `ffmpeg`'s first stderr line.
- **Route** (`src/plugins/video/activate.ts`). The command handler sends a `snapshot` argument to the parser and `startSnapshot`; anything else keeps going to `openClaimedFiles`. The manifest adds the `originTab` capability.

## Implementation steps

1. Add `src/plugins/video/snapshot-parse.ts` with `isSnapshotArgument`, `parseTimestamp`, `parseSnapshotArgument`, and the `SNAPSHOT_USAGE` string.
2. Add `src/plugins/video/snapshot-ffmpeg.ts` with `extractFrame`.
3. Add `src/plugins/video/snapshot.ts` with `startSnapshot` and the failure-text helper.
4. Route `snapshot` in `src/plugins/video/activate.ts`'s `command`, and add `'originTab'` to `src/plugins/video/manifest.ts`.

Comments: one in `snapshot-ffmpeg.ts` saying why both paths are absolute before they reach `ffmpeg`, and one on `startSnapshot` saying why the command does not await it.

## Tests

- `src/plugins/video/snapshot-parse.test.ts`: seconds, fractions, `m:ss`, `h:mm:ss`, and refusal of `1:60`, `abc`, empty and four-field times; the parser splitting video, time, and destination; paths containing spaces and an `at` word inside the video name; usage errors for a missing `at`, a missing destination, and an invalid time; `isSnapshotArgument` case-insensitivity and its refusal of an ordinary path.
- `src/plugins/video/snapshot.test.ts` (fake capabilities and a fake extractor): relative paths resolve against the tab's cwd and `~` against the home directory; rejections for a remote tab, a missing video, a bad extension, a missing destination directory, and an existing destination; success, no-frame, `ENOENT`, and stderr failure notes.
- `src/plugins/video/snapshot-ffmpeg.test.ts`: a real extraction from a generated test video, skipped when `ffmpeg` is not on `PATH`.
- `src/plugins/video/activate.test.ts`: `video snapshot …` goes to the snapshot path and not to `openClaimedFiles`; `video snapshot` alone rejects with the snapshot usage.

## Spec and docs

- `product/specs/video-tab.md`: a "Snapshot from the command line" section; scope the "never chooses the destination" paragraph to the capture control.
- `product/specs/open.md`: the `video <path>` section notes that a first word of `snapshot` is the snapshot subcommand.
- `help/video.md` and the `video` row of `help/commands.md`: the new usage and an example.
- `documentation/user-documentation/tab-types/video-player.md`: a short note under "Capture a still frame".

## Out of scope

- Completion for the subcommand's words.
- Overwriting an existing destination, choosing other image formats, or opening the result.
- Snapshots on a remote tab's filesystem.
- Changing the capture control in the video tab.
