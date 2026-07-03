# Edit command appears in transcript before editor tab opens

**Complexity: 1/10** — add one line to `src/commands/edit.ts` to append the command to the transcript, plus a test.

## Goal

When a user types `edit foo.md`, a transcript entry for that command appears in the originating tab **before** the editor tab opens and steals focus. Currently, a successful `edit` command opens the editor tab without adding any transcript entry — the command is invisible in the output history.

## Background

The `edit` command handler calls `managers.openFile.edit()` on success but never appends the command to the transcript. The error path (no target) already calls `managers.tab.append()`, so the pattern already exists in the same file. The `harness` handler in `command-manager.ts` also follows this pattern — append first, then act.

The `open` command has the same gap (no transcript entry on success), but that is out of scope for this fix.

## Approach

Add `managers.tab.append(tab.label, { input: command, output: '' })` immediately before `managers.openFile.edit()` in `src/commands/edit.ts`. The command text becomes the `input` field and the editor tab opens as the side-effect.

## Implementation steps

1. **Add transcript append** to `src/commands/edit.ts` line 11 — insert `managers.tab.append(tab.label, { input: command, output: '' });` before `managers.openFile.edit(command, target, tab.label);`

2. **Create test** at `src/commands/edit.test.ts` — test that the `run` method appends the command to the transcript before calling `openFile.edit`.

3. **Run `./scripts/run.mjs check-diff`** after each step.

## Tests

- `src/commands/edit.test.ts` — mock `managers` and verify `tab.append` is called with `{ input: 'edit foo.txt', output: '' }` before `openFile.edit` is called, and that an empty target still yields the usage error.

## Out of scope

- No change to `open` command (same gap exists, separate issue)
- No change to `OpenFileManager.edit` or `openInEditor`
- No change to the editor tab lifecycle

## Verification

`./scripts/run.mjs check-diff` must pass clean.
