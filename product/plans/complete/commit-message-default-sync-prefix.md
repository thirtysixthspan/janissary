# Default commit message uses the sync: prefix

**Complexity: 2/10** — a string-literal change in one pure helper module, plus the tests and prose that pin its exact output.

Backlog text: *"The commit messages should start with sync: not commit:"*

`defaultCommitMessage` and `defaultCommitMessageForCount` (`web/src/file-navigator/file-navigator-commit-message.ts:11`–`:21`) generate the file navigator's pre-filled commit message as `commit: <filename>` / `commit: <n> files`. That module's own doc comment already notes the established convention this codebase uses for a generated commit message is `sync: <filename>` (`src/git/sync.ts:98`) — the file navigator's commit field is the one place that generates a message with a different verb, and this fix brings it in line.

## Design decisions

**Only the generated default text changes.** The notification lines this feature produces — `Committed to origin: …`, `Could not commit: …`, `Nothing to commit` (`src/file-navigator/commit-report.ts`) — are a different string entirely (the notification's own stem, not the commit message), and are untouched by this fix. A message the user types over the default is untouched too; this only changes what the field opens pre-filled with.

**No behavior changes, only the literal text.** `defaultCommitMessage` still names a single file outright and counts everything else; `defaultCommitMessageForCount` still always counts. Neither function's branching logic changes, only the `commit:` substring each returns becomes `sync:`.

## Proposed changes

**`web/src/file-navigator/file-navigator-commit-message.ts`.** Change `commit: ${basename(paths[0])}` and `commit: ${paths.length} files` in `defaultCommitMessage` (`:12`), and `'commit: 1 file'` / `` `commit: ${count} files` `` in `defaultCommitMessageForCount` (`:20`), to their `sync:` equivalents. Update the doc comment at `:8`–`:10`, which currently says this function "follows [the `sync:` convention] with its own verb" — that sentence stops being true once the verb matches, so reword it to say the field now uses the same `sync:` prefix `src/git/sync.ts:98` established, rather than a distinct one.

**`product/specs/file-navigator-tab.md`.** The "Committing to origin" section's examples at `:715`–`:718` (`commit: notes.md`, `commit: 3 files`, `commit: 1 file`) become `sync: notes.md`, `sync: 3 files`, `sync: 1 file`.

**`documentation/user-documentation/tab-types/file-navigator.md`.** The matching examples at `:97` (`commit: notes.md`, `commit: 3 files`, `commit: 1 file`) get the same substitution.

Every other file that contains the literal string `commit: <something>` in this codebase (server-side plumbing tests such as `src/file-navigator/manager.test.ts`, `src/client-params/file-navigator.test.ts`, `src/remote/filesystem-operations.test.ts`, and the client's `useFileNavigatorIntents.test.ts`) uses it only as an arbitrary example message threaded end to end through a validator or RPC — none of them assert on what `defaultCommitMessage`/`defaultCommitMessageForCount` actually produce, so none of them need to change for this fix to be correct, and touching them would be out of scope.

## Tests

- **`web/src/file-navigator/FileNavigatorCommitPopup.test.tsx`**: update every assertion that pins `defaultCommitMessage`/`defaultCommitMessageForCount`'s literal output (`:23`, `:27`, `:33`, `:37`, `:41`) and every rendered-default assertion derived from it (`:48`, `:54`) and the `renderPopup` helper's own default argument (`:7`) and the direct-render case (`:94`) to the `sync:` prefix.
- **`web/src/file-navigator/FileNavigatorTab.test.tsx`**: update the rendered-default assertions at `:140`, `:154`, `:158`, `:173`, `:187`, `:190` to the `sync:` prefix.
- **`web/src/file-navigator/FileNavigatorOverlays.test.tsx`**: update the two `defaultMessage` fixtures and their rendered-value assertions at `:374`–`:377`, `:391` to the `sync:` prefix.

## Out of scope

- **Any file that merely threads an arbitrary commit message through unchanged** (validators, RPC plumbing, remote-operation encoding) — the message content is opaque to those layers, so their example strings staying `commit: …` does not make them wrong; only the two generator functions and the tests/prose that pin their actual output are in scope.
- **The notification text's own `Could not commit:` / `Committed to origin:` stems** — a separate vocabulary from the generated commit message, untouched here.

## Verification

```
$janissary/scripts/run.mjs check-diff
```

Manual check: open a file navigator on a git repository, right-click a single file and choose **Commit to origin** — the field opens pre-filled with `sync: <filename>`. Select several files and repeat — `sync: <n> files`. Click the header **Commit changes to origin** button — `sync: <n> files` (or `sync: 1 file` for exactly one change), never naming the file even when there is only one.
