# Shell tab text transcript 03: failure notification kind and transcript directory

**Complexity: 2/10** — two small, inert additions following exact precedents: a new notification kind beside `shell-recording-failed` (three typed tables the compiler already polices), and a directory module copied from `src/harness/transcript-file.ts` plus its state-directory registry entry; the only trap is the hand-maintained mock list and entry count in `src/state/dirs.test.ts`.

## Goal

Add the `shell-transcript-failed` notification kind and the `.janissary/shell-transcripts/` directory module with its fresh-launch-clear / relaunch-preserve registration. Both are inert until subplans 04 and 05 use them.

Source plan: `product/plans/ready/shell-tab-text-transcript.md`, implementation-order steps 3 and 4.

## Design decisions carried from the source plan

- **Decision 10** (the notification half) — a new kind beside `shell-recording-failed`: lower-case text `shell transcript failed`, listed in `EXPLICIT_EVENTS` so focus suppression cannot swallow it. Firing it at most once per tab is subplans 04 (writer fails once) and 05 (manager wires it).
- **Decision 2** (the directory and naming half) — files live under `.janissary/shell-transcripts/`, named `<sanitized-label>-<ISO-timestamp>.txt` through the shared `harnessArtifactFilename`, so a tab's transcript and recording share a stem.
- **Decision 9** (the lifecycle half) — the directory is a new `always: false` entry in `STATE_DIRECTORY_ENTRIES`, cleared at a fresh launch and preserved across `--relaunch`.

## Dependencies

None. Independent of subplans 01 and 02. Subplan 04 depends on this one and imports the directory module by the exact names fixed below (`ensureShellTranscriptDirectory`, `shellTranscriptPath`); subplan 05 depends on the notification kind.

The two halves (notification, directory) are independent of each other and each leaves typecheck and tests green on its own.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `'shell-recording-failed'` in `NotificationEventType` and `EXPLICIT_EVENTS` | `src/notifications/index.ts:66` (`\| 'shell-recording-failed'`), `:123` (`'shell-recording-failed': true,`) | New kind added directly after it in both |
| `case 'shell-recording-failed'` text | `src/notifications/format.ts:70` (`case 'shell-recording-failed': { return 'shell recording failed'; }`) | New case directly after it |
| `CATEGORIES: Record<ExplicitNotificationEvent, SoundCategory>` | `src/notifications/sound-category.ts:5`, entry at `:27` | `'shell-transcript-failed': 'error'` directly after `'shell-recording-failed'` (the typecheck demands it) |
| init/ensure/path/clear quartet and its test | `src/harness/transcript-file.ts`, `src/harness/transcript-file.test.ts` | Shape to copy, test included |
| `harnessArtifactFilename(label, timestamp, extension)` | `src/harness/artifact-name.ts` | Filename builder; already imported from outside `src/harness/` by `src/browser/browser-log.ts` and `src/git/failure-output.ts`, so importing it from `src/shell/transcript/` crosses no boundary rule |
| `STATE_DIRECTORY_ENTRIES`, `KNOWN_STATE_DIRECTORY_KEYS`, `STATE_DIRECTORY_ORDER_IS_COMPLETE` | `src/state/dirs.ts` (the `harnessTranscript` entry is the one to copy) | New entry and key; the completeness assignment fails to compile if either is missing |
| Per-kind explicit-event test block | `src/notifications/index.test.ts:205` (`describe('shouldNotify — shell-recording-failed event', …)`) | Block to copy for the new kind |
| Fixed-body table | `src/notifications/format.test.ts:85-92` (`it.each([... ['shell-recording-failed', 'shell recording failed'], ] as const)`) | Add a row |

## Proposed changes

### Notification

- `src/notifications/index.ts`:
  - Add `'shell-transcript-failed'` to `NotificationEventType` directly after `'shell-recording-failed'`, and to `EXPLICIT_EVENTS` directly after `'shell-recording-failed': true`. It must not be added to `AmbientNotificationEvent` / `AMBIENT_EVENTS`.
  - Extend the header comment that lists the kinds (line 13, the sentence naming `ssh-recording-failed`, `harness-recording-failed` and `shell-recording-failed`) with a clause saying `shell-transcript-failed` reports that a shell tab's text transcript was abandoned, so nothing more of that session's text lands on disk. The comment above `EXPLICIT_EVENTS` already covers it ("an abandoned recording … bypass it for one shared reason") — leave it, but its "an eighteenth event" wording is already stale and need not be touched.
- `src/notifications/format.ts` — `case 'shell-transcript-failed'` returning the fixed string `shell transcript failed`, directly after the `shell-recording-failed` case. Like its neighbours it ignores `detail`; the tab label comes from the line header.
- `src/notifications/sound-category.ts` — `'shell-transcript-failed': 'error'` directly after `'shell-recording-failed': 'error'`.
- Every other consumer was checked and needs no change: `src/notifications/queue.ts` only types a field with the union; `src/notifications/native.test.ts:97` and the table-driven block at `src/notifications/index.test.ts:25-53` enumerate `Object.keys(EXPLICIT_EVENTS)` and pick the new kind up automatically; `web/src/` names no notification kind. Nothing fires the kind in this subplan.

### Directory

- New `src/shell/transcript/transcript-file.ts` (the `src/shell/transcript/` directory is new; subplans 04 and 05 add `writer.ts` and `manager.ts` beside it), a copy of `src/harness/transcript-file.ts` with these names and differences:
  - Module-level directory string, empty until init.
  - `initShellTranscriptDirectory(projectDirectory)` — sets it to `path.join(projectDirectory, '.janissary', 'shell-transcripts')`.
  - `ensureShellTranscriptDirectory()` — `mkdirSync(..., { recursive: true })`.
  - `shellTranscriptPath(label, startedAt)` — `path.join(directory, harnessArtifactFilename(label, startedAt, '.txt'))`.
  - `clearShellTranscriptDirectory()` — returns at once when the directory is still empty (uninitialised), otherwise `rmSync(..., { recursive: true, force: true })` inside a try/catch that ignores errors.
  - Imports: `node:fs`, `node:path`, and `../../harness/artifact-name.js` (`.js` extension, NodeNext).
  - Header comment: the directory is distinct from `.janissary/transcripts/` (`TranscriptStore`'s per-tab `<label>.json` logs) and from `.janissary/harness-transcripts/` (harness session transcripts), and the clear-at-fresh-launch / preserve-across-`--relaunch` policy comes from its `src/state/dirs.ts` entry. (The precedent's comment says the policy comes "from `src/main.ts`"; that is stale since the registry moved to `src/state/dirs.ts` — do not copy it.)
- `src/state/dirs.ts`:
  - Import `initShellTranscriptDirectory, clearShellTranscriptDirectory` from `../shell/transcript/transcript-file.js`, beside the `../harness/transcript-file.js` import.
  - A new entry named `shellTranscript` whose init calls `initShellTranscriptDirectory` with the project directory, whose clear calls `clearShellTranscriptDirectory`, and with `always: false` — written exactly like the `harnessTranscript` entry and placed directly after it.
  - `'shellTranscript'` added to `KNOWN_STATE_DIRECTORY_KEYS` directly after `'harnessTranscript'`.
  - The file is about 130 non-blank, non-comment lines today; the addition keeps it well under 200.
- `src/main.ts:73,79` (`initStateDirectories`, `clearStateDirectories`) drives the registry and needs no change. `src/sessions/store.test.ts:193` reads `STATE_DIRECTORY_ENTRIES` only to find `remoteSessions` and needs no change.

## Tests

- `src/notifications/format.test.ts` — add `['shell-transcript-failed', 'shell transcript failed']` to the fixed-body `it.each` table after the `shell-recording-failed` row.
- `src/notifications/index.test.ts` — a `describe('shouldNotify — shell-transcript-failed event', …)` block after the `shell-recording-failed` one, mirroring it: fires with `allOff` and `undefined` config, fires when the shell tab is the active one, renders `shell transcript failed`.
- `src/notifications/native.test.ts` needs no edit (it enumerates `EXPLICIT_EVENTS`).
- New `src/shell/transcript/transcript-file.test.ts`, mirroring `src/harness/transcript-file.test.ts` (with `vi.mock('node:fs')`): ensure creates `<project>/.janissary/shell-transcripts`; `shellTranscriptPath('zsh', Date.UTC(...))` ends in `zsh-<ISO-with-dashes>.txt`; clear removes the directory recursively and tolerates a second clear; clear ignores a throwing `rmSync`; clear before init removes nothing (fresh import after `vi.resetModules()`). Coverage is attributed per file, so the precedent's tests do not cover this module.
- `src/state/dirs.test.ts` — the test mocks every registry module by hand, so all of these are required, not optional:
  - Add `initShellTranscriptDirectory` and `clearShellTranscriptDirectory` to the hoisted `mocks` object and a `vi.mock('../shell/transcript/transcript-file.js', …)` beside the `../harness/transcript-file.js` one. Without the mock the real clear would run `rmSync` against `/project/.janissary/shell-transcripts`.
  - `inits every registered subsystem`: expect `initShellTranscriptDirectory` called with `'/project'`.
  - `covers exactly the keys`: `toHaveLength(13)` becomes `toHaveLength(14)`.
  - `clears every entry with a clear on a fresh start`: expect `clearShellTranscriptDirectory` called once.
  - `runs no per-subsystem clear on a relaunch except the always ones`: expect `clearShellTranscriptDirectory` not called.

## Verification

- `./scripts/run.mjs check-diff`.
- No manual check: nothing writes to the directory or fires the notification yet (subplans 04–05). The directory is never created by this subplan; only a fresh launch's clear touches it, and that is a no-op when it does not exist.

## Out of scope

- The writer that writes into the directory and calls the failure callback — subplan 04.
- Firing `notify(managers, 'shell-transcript-failed', label)` — subplan 05.
- Spec text for the directory and notification (`product/specs/notifications.md`, `product/specs/shell-tab.md`) — subplan 08.
- Fixing the stale `src/main.ts` reference in `src/harness/transcript-file.ts`'s comment or the stale "eighteenth event" wording in `src/notifications/index.ts`.
