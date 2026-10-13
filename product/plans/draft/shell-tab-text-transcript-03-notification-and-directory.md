# Shell tab text transcript 03: failure notification kind and transcript directory

**Complexity: 2/10** — two small, inert additions following exact precedents: a new notification kind beside `shell-recording-failed`, and a directory module in the shape of `src/harness/transcript-file.ts` with its state-directory registry entry.

## Goal

Add the `shell-transcript-failed` notification kind and the `.janissary/shell-transcripts/` directory module with its fresh-launch-clear / relaunch-preserve registration. Both are inert until subplans 04 and 05 use them.

Source plan: implementation-order steps 3 and 4.

## Design decisions carried from the source plan

- **Decision 10** (the notification half) — a new kind beside `shell-recording-failed`: lower-case text `shell transcript failed`, listed in `EXPLICIT_EVENTS` so focus suppression cannot swallow it. Firing it at most once per tab is subplans 04 (writer fails once) and 05 (manager wires it).
- **Decision 2** (the directory and naming half) — files live under `.janissary/shell-transcripts/`, named `<sanitized-label>-<ISO-timestamp>.txt` through the shared `harnessArtifactFilename`, so a tab's transcript and recording share a stem.
- **Decision 9** (the lifecycle half) — the directory is a new `always: false` entry in `STATE_DIRECTORY_ENTRIES`, cleared at a fresh launch and preserved across `--relaunch`.

## Dependencies

None. Independent of subplans 01 and 02.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `shell-recording-failed` in `NotificationEventType` and `EXPLICIT_EVENTS` | `src/notifications/index.ts:66`, `:123` | New kind added beside it |
| `case 'shell-recording-failed'` text | `src/notifications/format.ts:70` | New case beside it |
| Typed sound-category record over every kind | `src/notifications/sound-category.ts:27` | `'shell-transcript-failed': 'error'` (the typecheck demands it) |
| init/ensure/path/clear quartet | `src/harness/transcript-file.ts` | Shape to copy |
| `harnessArtifactFilename(label, startedAt, ext)` | `src/harness/artifact-name.ts` | Filename builder |
| `STATE_DIRECTORY_ENTRIES`, `KNOWN_STATE_DIRECTORY_KEYS` | `src/state/dirs.ts` | New entry and key |

## Proposed changes

### Notification

- `src/notifications/index.ts` — add `'shell-transcript-failed'` to `NotificationEventType` beside `'shell-recording-failed'`, and to `EXPLICIT_EVENTS`; extend the header comment that lists the kinds a plugin tab reports (line 13) to name it.
- `src/notifications/format.ts` — `case 'shell-transcript-failed'` returning `shell transcript failed`.
- `src/notifications/sound-category.ts` — `'shell-transcript-failed': 'error'`.

### Directory

- New `src/shell/transcript/transcript-file.ts` in the shape of `src/harness/transcript-file.ts`: an init function setting the directory to `<project>/.janissary/shell-transcripts`, an ensure function, `shellTranscriptPath(label, startedAt)` built through `harnessArtifactFilename` with a `.txt` extension, and a clear function that tolerates an uninitialised directory. A header comment explains the directory is distinct from `.janissary/transcripts/` and `.janissary/harness-transcripts/`.
- `src/state/dirs.ts` — a new `shellTranscript` entry with `always: false`, wired to the new init and clear in the same way the `harnessTranscript` entry is, and `'shellTranscript'` added to `KNOWN_STATE_DIRECTORY_KEYS`.

## Tests

- `src/notifications/format.test.ts` — the `shell-transcript-failed` kind formats as `shell transcript failed`.
- `src/state/dirs.test.ts` — the new `shellTranscript` entry is cleared on a fresh launch and preserved on relaunch (mirror the existing per-entry cases).
- If a notifications test enumerates `EXPLICIT_EVENTS`, extend it to include the new kind.

## Verification

- `./scripts/run.mjs check-diff`.
- No manual check: nothing writes to the directory or fires the notification yet.

## Out of scope

- The writer that writes into the directory and calls the failure callback — subplan 04.
- Firing `notify(managers, 'shell-transcript-failed', label)` — subplan 05.
- Spec text for the directory and notification — subplan 08.
