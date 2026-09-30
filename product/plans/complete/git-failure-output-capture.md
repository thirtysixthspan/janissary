# Git failure output goes to a linked file

Issue: the error below was output directly to the notifications tab. It should be a notification that follows the notification formatting and any error output added to a capture file and linked to the notification.

```
error: failed to push some refs to 'github.com:thirtysixthspan/janissary.git'
1:35PM INF no leaks found
1:35PM INF scanned ~35730278 bytes (35.73 MB) in 7.92s
1:35PM INF 2938 commits scanned.
```

Complexity rating: 4/10

## Goal

When a git action the user armed fails — a file navigator commit or pull, an editor tab's commit-to-origin, or a synced file's save-triggered sync — the notification line carries git's whole error. For a `git` process that is Node's `Command failed: git push origin HEAD` followed by everything the process wrote to stderr, including hook output such as the gitleaks scan above, so one notification spills many unformatted lines into the feed and the toast. The line should read like every other notification — one line, `Could not commit: <first line of the error>` — and the full error output should be kept in a file the line links, the way a dead browser's log is.

## Approach

- Add `src/git/failure-output.ts`, modelled on `src/browser/browser-log.ts`: `initGitFailureDirectory(projectDir)` sets `.janissary/git-errors`, `clearGitFailureDirectory()` removes it, and `writeGitFailureOutput(label, failedAt, error)` writes the error's full text to `<label>-<iso>.log` (named with `harnessArtifactFilename`) and returns the path. It returns `undefined` — and writes nothing — when the directory was never initialized, when the error text is a single line (the notification already shows all of it), or when the write fails (never throws: it runs while a failure is being reported).
- Register the directory in `src/state-dirs.ts` (init plus clear on a fresh start, like `browserLog`).
- Report the first line only: `commitFailureText`, `commitFailureLeavesStagedText`, and `pullFailureText` use `errorFirstLine` from `src/error-text.ts`, as do the editor commit's and the git-sync save's failure lines.
- At each of the four failure sites, pass `{ openFile: writeGitFailureOutput(label, Date.now(), error) }` to `notify`.

## Implementation steps

1. Create `src/git/failure-output.ts` and its test.
2. Register `gitFailureOutput` in `src/state-dirs.ts` (`STATE_DIRECTORY_ENTRIES` and `KNOWN_STATE_DIRECTORY_KEYS`).
3. Switch `src/file-navigator/commit-report.ts` and `src/file-navigator/pull-report.ts` failure texts to `errorFirstLine`.
4. Link the output file from `src/file-navigator/manager/commit.ts` and `src/file-navigator/manager/pull.ts`.
5. In `src/editor/commit.ts`, report `errorFirstLine(error)` and link the output file.
6. In `src/editor/save.ts` (`syncAfterSave`), report `errorFirstLine(result.error)` and link the output file.
7. Mention the new artifact in `src/harness/artifact-name.ts`'s comment listing the artifacts that share the filename shape.

## Tests

- `src/git/failure-output.test.ts`: no write before init; a multi-line error writes its full text to `.janissary/git-errors/<label>-<iso>.log` and returns the path; a single-line error writes nothing; a string error is accepted; a failed write or mkdir returns `undefined`; clear removes the directory and swallows errors, and removes nothing before init.
- `src/state-dirs.test.ts`: the registry now holds 15 entries; `gitFailureOutput` inits with the project dir, clears on a fresh start, and is left alone on a relaunch.
- `src/file-navigator/commit-report.test.ts` and `pull-report.test.ts`: a multi-line git error reports its first line only.
- `src/file-navigator/manager.test.ts`: a failed commit and a failed pull notify with the first line and link the written output file.
- `src/editor/commit.test.ts`: a multi-line commit failure notifies with its first line and links the output file.
- `src/editor/save.test.ts`: a multi-line sync failure notifies with its first line and links the output file.

## Out of scope

- Other notifications that carry multi-line text (a dead browser's message, plugin notes) — they already bound or format their own text.
- The file navigator's per-path file-operation failures.
- Changing which git commands run, or their environment.

## Specs and docs

- `product/specs/file-navigator-tab.md`: pull and commit failures read the first line of git's error, with the full output in a linked file.
- `product/specs/editor-tab.md`: the sync failure line carries the first line of the reason, with the full output linked.
- `product/specs/notifications.md` (`file-operation`): the same for pull and commit failures.
- `documentation/user-documentation/tab-types/file-navigator.md`: the pull and commit failure wording, in place.
- `help.md`: checked; it does not describe these notification lines.
