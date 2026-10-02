# `play` searches the recordings directory for a name it cannot find on disk

**Complexity: 4/10** — one resolution rule, one directory read, and the refusal wording they touch. The recorders already write every session's file into one known directory under a name derived from the tab label; nothing has to be recorded differently for a recording to be reachable by name.

`play <file>` resolves its target the way `open` does and then stops: a path that is not there is
`no such file`, full stop. That is correct and it is also nearly useless for the one thing `play` is
for — a recording whose name the user does not have memorized. Every recording is
`.janissary/recordings/<label>-<ISO timestamp>.cast`, so the file's own name is the only thing standing
between a user and the recording they want, and it is a name no one would guess. Removing
`harness replay <label>` took away the label form, so a recording is currently reachable only by
typing its full timestamped path.

The search closes that gap: when `play` cannot find the file it was given, it looks for a recording of
that name in the recordings directory.

## Design decisions

**The name searched is the target's stem — its basename with any `.cast` suffix removed.** So `play
devbox.cast` finds `devbox-2026-07-10T18-30-05-123Z.cast`, and `play
.janissary/recordings/devbox-2026-07-10T18-30-05-123Z.cast` finds itself when typed from somewhere
else. One rule covers both, because both are the same statement: *this file, or this session*.

**A target with no extension is a recording name rather than a type.** This is the one widening the
entry does not spell out, and it is the case the entry is for: `play devbox` is what anyone types, and
a rule that only answered to `play devbox.cast` would leave the awkward half-typed form as the only way
in. Every target that *has* an extension is unaffected — `.txt` and `.png` are still refused by type
before any filesystem question is asked — so the widening is confined to a target that could not have
resolved to a file anyway.

**A session's recordings match `<stem>-<stamp>.cast`, not any file beginning with `<stem>`.** A bare
prefix match would make `play devbox` reach `devbox-2-…cast` as readily as `devbox-…cast`, and two
sessions to the same ssh destination are labeled `devbox` and `devbox-2`. Requiring the exact shape
`harnessArtifactFilename` writes keeps those apart, and reuses the one rule that produced the names in
the first place rather than inventing a second reader of them.

**A name several recordings answer is answered by the most recent.** A detach and reattach writes two
files for one session, and the recordings directory holds everything from this run, so "the devbox
recording" is the newest one. The stamp `harnessArtifactFilename` writes is fixed-width and made of
digits and dashes, so ordering those names lexically *is* ordering them in time — no `stat`, and no
second reading of the timestamp format to agree with the writer's.

**The search is a fallback, never a shortcut.** An explicit path that exists is played as written. Only
a file that is not there falls through to the directory, so `play` never silently opens a different
recording than the one named.

**The directory comes from the module that owns it.** `initHarnessRecordingDirectory` is what the
recorders write into, so reading the path back from there is how `play` learns where recordings are
without re-deriving `<projectDir>/.janissary/recordings` and hoping the two still agree.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The directory recordings are actually written to | `recordingDirectory` in `src/harness/recording-file.ts`, which `ensureRecordingDirectory` and `harnessRecordingPath` both already read |
| The exact filename shape a recording carries | `harnessArtifactFilename` in `src/harness/artifact-name.ts`, which writes `<sanitized label>-<ISO stamp><extension>` |
| The reverse of that shape, used to recover a label from a filename | `asciicastLabelFromFilename` in `src/plugins/asciicast/activate.ts` — the same stamp pattern, read the other way |
| Where `play` resolves a path and reports each way it can fail | `src/play/run.ts` |

## Proposed changes

### The recordings directory

`src/harness/recording-file.ts` gains `harnessRecordingDirectory()`, returning the module's own path. It
is the accessor the recorder already has by construction and nothing else can read, so `play` is not
recomputing where recordings live.

### The matching rule

`src/play/recording-search.ts`, pure and filesystem-free so the whole decision is testable:

```ts
export function findRecording(names: readonly string[], stem: string): string | undefined
```

Two tiers, in order — the session's own recordings (`<stem>-<stamp>.cast`, newest first), then a file
of exactly the name asked for (`<stem>.cast`). Both patterns are anchored and escaped, so a stem
holding regex metacharacters is matched literally and `devbox` cannot reach `devbox-2`.

### The command

`src/play/run.ts` inserts the search between the existence check and the refusal. The playable check
moves ahead of it and gains one clause: a target with no extension is a candidate, because the search
is the only thing that can resolve it. The three refusals and their wording are unchanged.

## Tests

`src/play/recording-search.test.ts`, new:

- **finds a session's newest recording by its label alone**, so `devbox` answers
  `devbox-2026-07-10T18-30-05-123Z.cast` where several exist, and the newest is the one chosen.
- **does not let one session's name reach another's**, so `devbox` answers nothing when only
  `devbox-2-…cast` is there, and `devbox-2` does not match `devbox`'s file.
- **answers an exactly-named file**, so a `.cast` that was not written by the recorder is still found.
- **matches a name literally**, so a stem holding `.` or `+` is not a pattern.
- **answers undefined for a name no recording carries.**

`src/play/run.test.ts`, extended:

- **falls back to the recordings directory when the named file is not there**, so `play devbox.cast`
  with no such file in the tab's cwd still reaches the asciicast plugin with the recorded path.
- **still plays an existing path as written**, so the fallback never overrides a file that is really
  there.
- **reports `no such file` when neither the path nor a recording of that name is there.**
- **reaches a recording by its bare label**, so `play devbox` with no extension is a candidate rather
  than a type refusal.
- **still refuses a named extension by type before touching the filesystem**, so `play notes.txt` and
  `play photo.png` keep reporting `not a playable file` whatever the directory holds.
- **reports `no such file` for an extensionless target the directory does not answer to.**

`src/harness/recording-file.test.ts`, extended: `harnessRecordingDirectory()` answers the path
`initHarnessRecordingDirectory` was given, and is empty before initialization.

## Specs

- `product/specs/open.md` § `play` command: the search, the two name shapes, the newest-wins rule, and
  that an explicit existing path is never overridden.
- `product/specs/harness-recording.md` § Retrieval: a recording is reachable by its label again, which
  is what replaced the `harness replay <label>` form.

## Out of scope

- **Recording agent tabs.** A separate backlog entry, and one this change does not touch: it reads the
  recordings directory, and nothing about which sessions write into it.
- **`play` on a video or audio file**, which is its own entry and which this change also does not touch.
- The recordings directory's lifecycle — cleared at a fresh launch, preserved across `--relaunch` — and
  `asciinema play` on the files.
- Searching by substring or by partial timestamp. The rule matches a whole label or a whole filename, so
  there is no ranking to get wrong and nothing to guess at.
- A picker listing the directory when nothing matches. The refusal names the file that is missing, which
  is what the user needs to correct it.

## Verification

`./scripts/run.mjs check-diff`.