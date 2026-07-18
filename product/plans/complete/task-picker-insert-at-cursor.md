# Task picker inserts at the cursor instead of overwriting the command line

**Complexity: 4/10** — a web-only change that reroutes the task picker's insertion through the command input's existing `insertAtCaret` handle (already built for file-tree drops), touching four small files plus their tests and the spec. No server/protocol changes, no new component logic.

Picking a task currently calls `recall(text)` (via `recallRef`), which replaces the **entire** command line with `execute …` and moves the cursor to the end — clobbering anything the user had already typed. The backlog issue asks the task picker to inject the `execute …` command at the current cursor position, leaving the surrounding command-line text intact.

## Design decisions

- **Reuse `insertAtCaret`**: `CommandInput` already exposes an `insertAtCaret(text)` handle through `dropRef` (`CommandInputDropHandle`), built for file-tree drag-and-drop. It focuses the textarea, then splices `text` over the current selection/caret via `document.execCommand('insertText', …)` (with a manual-slice fallback), preserving the rest of the line and undo history. That is exactly the desired "inject at the cursor without overwriting" behavior, so the task picker routes through the same handle rather than growing a parallel mechanism.
- **Task picker only**: the issue names only the task picker. The profile picker keeps its current overwrite (`populateCommandLine` → `recall`) behavior, so `populate-command-line.ts` gains a second, sibling helper rather than changing the shared one.
- **Harness tabs unchanged**: a harness tab has no command line, so the task still goes straight into that harness's PTY as terminal input — identical to today. Only the agent/transcript (command-line) branch changes from overwrite to insert-at-caret.
- **Cursor after insert**: `insertAtCaret` already leaves the caret immediately after the inserted text, so the user can keep typing/appending exactly where the command was dropped in.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Insert-at-caret command-input handle | `web/src/CommandInput.tsx:65` (`insertAtCaret`), exposed as `CommandInputDropHandle` via `dropRef` | Route the task pick through it |
| Shared drop ref, already created in App | `web/src/App.tsx:70` (`dropReference`) | Thread it into the task picker |
| Populate/PTY branch helper | `web/src/populate-command-line.ts` (`populateCommandLine`) | Add a sibling `insertIntoCommandLine` with the same harness-vs-command-line branch |

## Proposed changes

**`web/src/populate-command-line.ts`.** Add `insertIntoCommandLine(text, client, harnessPtyId, dropRef)` alongside the existing `populateCommandLine`. Same harness branch (`client.send({ method: 'ptyInput', … })` when `harnessPtyId` is set); the command-line branch calls `dropRef.current?.insertAtCaret(text)` instead of `recallRef.current?.(text)` + `focus()` (`insertAtCaret` focuses internally). Import the `CommandInputDropHandle` type from `./CommandInput`.

**`web/src/useTaskPicker.ts`.** Replace the `recallRef`/`inputRef` parameters with `dropRef: React.RefObject<CommandInputDropHandle | null>`. In `pickTask`, call `insertIntoCommandLine(command, client, harnessPtyId, dropRef)` and update the dependency array accordingly. Update the hook's doc comment to say the selected `execute …` command is inserted at the caret (preserving the rest of the line) rather than written over the whole command line.

**`web/src/usePopulatePickers.ts`.** Add a `dropRef` parameter and pass it to `useTaskPicker` (with the trimmed argument list); keep passing `recallRef`/`inputRef` to `useProfilePicker` unchanged.

**`web/src/App.tsx`.** Pass the existing `dropReference` into the `usePopulatePickers(…)` call.

## Tests

- `web/src/useTaskPicker.test.ts`: update the three command-line cases so the harness `dropRef` carries an `insertAtCaret` spy and assert it is called with `execute ./ai/tasks/<path>` (project) / `execute <dir>/<path>` (janissary), and that the picker closes without submitting. The harness-PTY case is unchanged (asserts `ptyInput` and that no command-line insert fires). Add a case confirming the command-line branch uses `insertAtCaret` (not a full-line overwrite) — i.e. a `recall`-style overwrite is never invoked.

## Out of scope

- The profile picker and the history/queue pickers — the issue is specific to the task picker; profiles keep their overwrite behavior.
- Any change to `insertAtCaret` itself or the file-tree drag path that also uses it.
- Adding spacing/quoting around the inserted command — the path is inserted verbatim, matching the existing verbatim-insertion behavior documented in the spec.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual: type some text into an agent tab's command line, place the cursor mid-line, open the task picker (`Ctrl+A` or `tasks`), and pick a task — confirm the `execute …` command is spliced in at the cursor with the surrounding text preserved (not replaced), and the caret sits just after the inserted command. On a harness tab, confirm the task still goes into the terminal input as before.
