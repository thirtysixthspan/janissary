# Make the file command's local glob test distinguish the workspace from the project root

**Complexity: 1/10** — test-only change: 0 production lines, 0 production files, 1 requirement, 2 scenarios (p=2.47)

The command-level test `globs under the workspace of a local tab that has one, untagged` in `src/commands/file.test.ts` expects `file glob *.md` to print `notes.md`. The shared `beforeEach` writes a `notes.md` into both the project root and the workspace, so the test passes identically whichever root the glob searches. It verifies routing to the glob handler only, not that the workspace is the root searched.

## Goal

The command-level glob test fails if a local tab with a workspace ever globs the project directory instead, and a mirror case pins that a local tab without a workspace globs the project directory.

## Approach

Inside the existing workspace test only, write an extra Markdown file, `project-only.md`, into the project root before running `file glob *.md`, keeping the expectation exactly `notes.md`. A glob of the project directory would then print `notes.md` and `project-only.md` and fail. Add a sibling test for a local tab without a workspace that writes the same file and expects both names. Leave the shared `beforeEach` alone, because the read tests depend on it. No production code changes.

## Implementation steps

1. In `src/commands/file.test.ts`, add the `project-only.md` write to the workspace glob test.
2. Add the mirror test `globs under the project directory for a local tab without a workspace` with `tabs = [{ label: 'janus' }]`, expecting `notes.md\nproject-only.md`.

## Tests

- Workspace tab: `file glob *.md` prints exactly `notes.md` while the project root also holds `project-only.md`.
- Tab without a workspace: `file glob *.md` prints `notes.md` and `project-only.md`.
- Temporarily point the workspace case at the project root (for example by dropping `workspaceDir`) to confirm the corrected test fails, then restore.

## Out of scope

- `src/commands/file.ts` and `src/file-glob/tab-glob.ts`, which already route correctly.
- The `globFilesInTab` tests in `src/file-glob/tab-glob.test.ts`.
- The shared `beforeEach` and the read tests.
- Specs and help pages, since no behavior changes.
