# docs(specs): bring the recording flag and launch directory specs in line with the not-recording state and kept recordings

**Complexity: 1/10** — spec text only: 0 production lines and 0 production files, 7 requirements (p=3.04)

## Goal

This pull request added a **not recording** state to the recording flag and stopped clearing recordings at launch. Four specs still describe the old behavior. `product/specs/tabs.md`, `product/specs/shell-tab.md` § The metadata row, and the recording-flag paragraph in `product/specs/harness.md` describe the flag with no off state. `product/specs/cli.md` § Startup sequence still names a per-run harness directory and leaves out the background age sweep. The next change to the flag or to the launch clear could be planned from that stale text, and it could drop the off label or bring back a launch clear of recordings. This plan corrects the four specs so they match `product/specs/harness-recording.md` § The recording flag and the boot sequence.

## Requirements

1. In `product/specs/tabs.md`, the flag tooltip list names "not recording" beside "recording", from the entry's "add "not recording" to the list of flag tooltips".
2. In `product/specs/tabs.md`, the recording-flag paragraph says a tab opened under `"logEnabled": false` shows the plain, inert flag labeled `not recording` for its whole life, from "extend the recording-flag paragraph so it says a tab opened under `"logEnabled": false` shows the plain, inert flag labeled `not recording` for its whole life".
3. In `product/specs/tabs.md`, the same paragraph says that flag never turns green, from "and never turns green".
4. In `product/specs/shell-tab.md` § The metadata row, the recording-flag paragraph states the off state in one sentence and points at `harness-recording` § The recording flag, from "add the same off state in one sentence each and point at `product/specs/harness-recording.md` § The recording flag".
5. In `product/specs/harness.md`, the harness recording-flag paragraph states the off state in one sentence and points at the same section, from the same sentence of the entry.
6. In `product/specs/cli.md` § Startup sequence, step 2 no longer implies a per-run harness directory, from "change step 2's "the per-run harness and browser directories" so it no longer implies a per-run harness directory".
7. In `product/specs/cli.md` § Startup sequence, step 5 says the background sweep of captures, recordings, and transcripts by `logRetentionInDays` starts there without delaying startup, from "add to step 5 that the background sweep of captures, recordings, and transcripts by `logRetentionInDays` starts there without delaying startup, matching `src/main.ts`".

## Design decisions

- Each edit points at `harness-recording` § The recording flag instead of restating it, so that section stays the one place that describes the off state in full. The entry asks for this: "each edit cross-references rather than restates".
- Step 2 of the startup sequence names the harness capture, recording, and transcript directories as kept and the browser directory as per-run. This follows the entry's example and matches `product/specs/state-directory.md`'s list of kept and per-run directories (Assumption 3).
- Step 5 keeps its existing clear and adds the sweep after it, because `src/main.ts` starts the sweeps immediately after `clearStateDirectories()` (Assumption 4).
- The off state's wording follows the code's label: the tooltip and accessible name are `not recording`, and the flag cannot be pressed or focused (Assumption 1, Assumption 2).

## Preserved behavior

None found

## Assumptions

1. The off flag's tooltip and accessible name are `not recording`: `web/src/shared/tab/flag-display.ts:31` `recordingOff: { icon: recordingIcon, label: 'not recording' }`.
2. The off flag is a non-pressable span whatever handler is supplied: `web/src/shared/RecordingFlag.tsx:28` `if (!onOpen || off) {`.
3. Captures, recordings, and harness and shell transcripts are kept across launches, and browser logs, git-failure output, and the workspace are per-run: `product/specs/state-directory.md:5` "Recordings under `.janissary/recordings/` and harness capture files under `.janissary/captures/`, along with harness and shell transcripts … are kept across launches and swept by age at launch instead".
4. The four age sweeps start unawaited right after the launch clear and use `logRetentionInDays`: `src/main.ts:81-84` `clearStateDirectories();` then `void reapHarnessCaptures(Date.now(), config.logRetentionInDays).catch(() => {});`.
5. The authoritative description of the off state, which these specs point at, is `product/specs/harness-recording.md:111` "A tab opened while `"logEnabled": false` is set will never record, and its flag says so".
6. A shell tab's flag reads not recording from the moment it opens: `product/specs/shell-tab.md:509` "the tab's recording flag reads **not recording** from the moment".

## Existing functionality

1. The cross-reference style already used for the recording flag in these specs: `product/specs/harness.md:1028` "See [[harness-recording]] § The recording flag."
2. The tabs spec's existing plain-path reference style: `product/specs/tabs.md:169` "`harness-recording.md` § The recording flag".

## Implementation steps

1. In `product/specs/tabs.md`, add "not recording" to the parenthetical tooltip list next to "recording". Extend the paragraph that begins "The recording flag is the only flag in the row that is also a control" with a sentence about a tab opened under `"logEnabled": false`. It shows the plain, inert flag with the tooltip `not recording` for its whole life and never turns green. The sentence points at `harness-recording.md` § The recording flag. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `product/specs/shell-tab.md` § The metadata row, add one sentence before the existing "See [[harness-recording]] § The recording flag." in the paragraph that begins "It also carries the **recording** flag". The sentence says that with `"logEnabled": false` the flag reads `not recording` from the moment the tab opens and is never green or pressable. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `product/specs/harness.md`, add the same one-sentence off state to the paragraph that begins "A harness tab's **recording** flag", before its closing cross-reference. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `product/specs/cli.md` § Startup sequence, rewrite step 2's parenthetical so it names the kept harness capture, recording, and transcript directories and the per-run browser directory. Extend step 5 to say that a background sweep then starts and deletes captures, recordings, and transcripts older than `logRetentionInDays` days, and that startup does not wait for it. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The plan changes spec text only and no user-visible surface.

## Tests

The plan changes no application behavior and introduces no code, so it adds no tests. Requirements 1 to 7 are confirmed by the reading-based check under Verification.

## Out of scope

- Any change to `product/specs/harness-recording.md`, `product/specs/ssh-tab.md`, `product/specs/state-directory.md`, or the other specs this pull request already updated.
- Any code, test, or help page change.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and confirm it passes.

Then read the four edited paragraphs:

- `product/specs/tabs.md`: the tooltip list names both "recording" and "not recording". The recording-flag paragraph says a tab opened under `"logEnabled": false` shows a plain, inert `not recording` flag for its whole life that never turns green, and it points at `harness-recording.md` § The recording flag.
- `product/specs/shell-tab.md` § The metadata row and `product/specs/harness.md`'s recording-flag paragraph: each has exactly one added sentence describing the off state, followed by the existing cross-reference.
- `product/specs/cli.md` § Startup sequence: step 2 no longer contains "per-run harness". Step 5 names the background `logRetentionInDays` sweep of captures, recordings, and transcripts and says startup does not wait for it.

The change was not made correctly if any of these paragraphs still describes the flag with no off state, if step 2 still lists a per-run harness directory, or if an edit restates the off state's details beyond what `harness-recording.md` § The recording flag says.
