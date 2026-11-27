# Correct the failed-save verification step in the pull request description

**Complexity: 1/10** — no production code changes, five description-only requirements, two already-pinned failed-save scenarios (p=3.25)

## Goal

The pull request description's How to verify step 13 tells a reviewer to make `.janissary/system-schedules.json` unwritable before typing `schedule system pause ping`. That does not fail the save: `SystemScheduleStore.save()` writes through `atomicWriteFile`, which creates `<store>.<uuid>.tmp` beside the store and renames it, so the file's own mode does not gate the write. A reviewer follows the step, sees `Paused ping in system.` and a rewritten store where the error was expected, and may file a persistence defect against working code. This change corrects that one step to make the containing `.janissary` directory unwritable instead, restore its mode afterwards, and keep the already-correct expectation. No application code changes.

## Requirements

1. How to verify step 13 instructs the reviewer to make `.janissary/` unwritable with `chmod 555 .janissary` rather than making `.janissary/system-schedules.json` unwritable (Proposal: "The step should read: 'Fail the save. Do: From the scratch project make `.janissary/` unwritable (`chmod 555 .janissary`), type `schedule system pause ping`, and restore its mode afterwards.'").
2. The corrected step keeps the `schedule system pause ping` command unchanged (Proposal: "type `schedule system pause ping`").
3. The corrected step tells the reviewer to restore the directory mode afterwards (Proposal: "and restore its mode afterwards").
4. The corrected step keeps the expected result: only `Could not save system schedules.` is printed, no success message, and the in-memory list and persisted snapshot keep the active entry (Proposal: "Expect: Only `Could not save system schedules.` is printed, no success message, and the in-memory list and persisted snapshot keep the active entry").
5. Every other paragraph of the description, including the already-corrected step 6 and the `### Additional test cases` section, stays byte-for-byte unchanged.

## Design decisions

- The correction is applied to the live GitHub PR body with `gh pr edit --body-file` after the commit is pushed, because the description is a live artifact while a file edit is not on the branch until push. The full revised body is read from `gh pr view --json body` and written to a scratch file first, since `gh pr edit` replaces the body wholesale.
- Only step 13's `Do:` line changes. The `Expect:` line already states the verified behavior and is reused verbatim, so the edit cannot drift the expected messages or the pinned tests.
- No application code, spec, help page, or test changes: the failed-save behavior is already implemented and already pinned by existing tests. The defect is in the verification instructions alone.

## Preserved behavior

1. A failed pause prints only `Could not save system schedules.` and leaves the schedule active. It must not also print `Paused ping in system.`. Pinned by `src/commands/schedule.test.ts` › `prints the save error without claiming a pause succeeded`.
2. The manager leaves memory and the persisted snapshot unchanged when a pause cannot be saved. It must not drop the active entry or advance its next run. Pinned by `src/schedule/system/manager.test.ts` › `leaves memory and the store unchanged when a pause cannot be saved`.

## Assumptions

1. The store writes a version-2 snapshot through the atomic writer: `src/schedule/system/store.ts:78` `atomicWriteFile(this.file, ...)`.
2. The atomic writer creates a temporary file beside the destination and renames it: `src/atomic-write.ts:10` `const temporary = \`${file}.${randomUUID()}.tmp\`;` and `src/atomic-write.ts:16` `renameSync(temporary, file);`.
3. A file at mode 0444 does not prevent creating a sibling temporary file and renaming over it, while a directory at mode 0555 prevents creating that temporary file: the Proposal's observation on commit `7fcb90ec`, consistent with Assumption 2.
4. The command prints the failure line in place of the success line on a failed save: `src/commands/schedule.ts:114` `append(result.ok ? \`Paused ${parsed.id} in system.\` : 'Could not save system schedules.');`.
5. The manager swaps memory only after a successful save: `src/schedule/system/manager.ts:163` `if (!this.save(entries)) return false;`.

## Existing functionality

1. The store already reports an IO failure when a write cannot complete: `src/schedule/system/store.ts:81` `return { ok: false, kind: 'io', error: ... }`.
2. The command already maps a failed pause to the exact error line: `src/commands/schedule.ts:114` `Could not save system schedules.`.
3. Two existing tests already pin the observable failed-save behavior: `src/commands/schedule.test.ts` › `prints the save error without claiming a pause succeeded` and `src/schedule/system/manager.test.ts` › `leaves memory and the store unchanged when a pause cannot be saved`.

## Implementation steps

1. **Correct the description step after the push.** Read the live body with `gh pr view <reference> --json body`. Replace only step 13's `Do:` line, `Make `.janissary/system-schedules.json` unwritable and type `schedule system pause ping`.`, with `From the scratch project make `.janissary/` unwritable (`chmod 555 .janissary`), type `schedule system pause ping`, and restore its mode afterwards.`. Leave the line's leading `Do:`, the step heading, the `Expect:` line, the already-corrected step 6, and the `### Additional test cases` section exactly as read. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. This change edits a pull request description only. It adds or changes no user interface surface, key binding, or command help page.

## Tests

This plan changes no application behavior and introduces no code, so no new tests are needed. The behavior the corrected step describes is already covered by `src/commands/schedule.test.ts` › `prints the save error without claiming a pause succeeded` and `src/schedule/system/manager.test.ts` › `leaves memory and the store unchanged when a pause cannot be saved`. Tests of documentation are not introduced.

## Out of scope

- No change to the `pause` or `resume` implementation, the store, or the atomic writer.
- No change to any other step of How to verify, including the already-corrected step 6, or to any other paragraph of the description.
- No change to `product/specs/`, `help/`, or `documentation/user-documentation/` and `documentation/developer-documentation/`.
- No change to the PR title, branch, or merge state.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Read the live body with `gh pr view <reference> --json body` and confirm step 13 says to make `.janissary/` unwritable with `chmod 555 .janissary`, type `schedule system pause ping`, and restore its mode afterwards, and that its `Expect:` line still names only `Could not save system schedules.` with the store and memory unchanged. Confirm step 6, every other paragraph, and the entire `### Additional test cases` section still read exactly as before the edit.
