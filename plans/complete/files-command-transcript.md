# Push `files <path>` into the issuing tab's transcript

**Complexity: 1/10** — one-line addition, matching an existing pattern used by every other
command in `src/commands/`.

## Goal

When a user types `files` or `files <path>` (including the `left`/`right` sidebar-docking
variants), the command should appear in the transcript of the tab that issued it, exactly like
`edit`, `state`, `msg`, `search`, and every other command already do. Today `files.ts` opens the
file tree tab but never calls `managers.tab.append`, so the command silently vanishes from the
transcript.

## Approach

Mirror the pattern in `src/commands/edit.ts`: call `managers.tab.append(tab.label, { input:
command_, output: '' })` before calling `managers.fileTree.open(...)`.

## Implementation steps

1. In `src/commands/files.ts`, add `managers.tab.append(tab.label, { input: command_, output: '' })`
   as the first statement in `run`, before `managers.fileTree.open(command_, tab.label)`.

## Tests

New file `src/commands/files.test.ts`, mirroring `src/commands/edit.test.ts`'s style:

- `command.name` is `'files'`.
- `command.match` matches `files`, `files foo`, `FILES foo` case-insensitively; does not match
  unrelated input.
- `run` appends `{ input: command_, output: '' }` to the transcript before calling
  `managers.fileTree.open`.
- Append happens before `fileTree.open` is called (call-order check, like edit's "appends before
  edit is called" test).
- Works for the `files left <path>` / `files right <path>` docking variants too (append still
  happens, `fileTree.open` still receives the raw command string).

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related server tests.
- Manual (not run in this environment): type `files` and `files ./src` in a tab, confirm the
  command text appears in that tab's transcript above the file tree opening.

## Out of scope

- Any change to `managers.fileTree.open`'s own behavior or the file tree tab UI.
- The other issues listed in `work/issues.md`.
