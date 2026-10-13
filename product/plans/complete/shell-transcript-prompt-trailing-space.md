# Shell transcript prompt keeps its trailing space

**Complexity: 1/10** — a prose-only correction to one plan and one pull request description; the behavior it describes is already implemented and pinned by an existing test, so no code changes.

## Summary

The pull request review for #1675 recorded: *"Correct the plan's and the pull request description's claim that the waiting prompt reaches the transcript as `>`, when the implementation and its own test keep the trailing space."*

`TranscriptRowTracker` writes each row with `translateToString(true)`, which trims only the cells a program never wrote. The space zsh prints after its `> ` prompt is a written cell, so a waiting prompt reaches the file as `> `, and `src/shell/transcript/manager.test.ts` (`has written the unfinished row once dispose resolves`) asserts exactly that (`'echo hello\nhello\n> \n'`). The feature plan instead says rows are "right-trimmed" and that a waiting `> ` prompt "arrives as `>`", and the pull request description's `cat` example ends on a bare `>`.

## Approach

Correct the prose to match the code and the test. The code and the test stay as they are.

## Implementation steps

1. `product/plans/complete/shell-tab-text-transcript.md`, decision 1 — replace "right-trimmed" with wording that says only cells the program never wrote are trimmed, so spaces a program printed, including the space after the `> ` prompt, are kept.
2. Same plan, the writer-and-row-tracker section — replace "so a waiting `> ` prompt arrives as `>`" with "so a waiting `> ` prompt is written as `> `".
3. After the branch is pushed, edit the pull request description's Behavior examples `cat` output so its last line is the `> ` prompt with its trailing space, followed by a note that the last line is the prompt that was waiting for input, written with its trailing space. Every other paragraph stays as written.

## Tests

No new test. The existing `has written the unfinished row once dispose resolves` case in `src/shell/transcript/manager.test.ts` already asserts the final row is written as `> ` with its trailing space.

## Specs and documentation

`product/specs/shell-tab.md` § Text transcript says the unfinished row is "written as it stands" and makes no trimming claim; `help.md` and `documentation/user-documentation/command-bar/shell.md` make none either. None of them changes.

## Out of scope

- Changing `TranscriptRowTracker` (`src/shell/transcript/row-tracker.ts`) or trimming trailing whitespace from rows.
- Changing the existing manager test.
- Any other paragraph of the pull request description, and its title.
