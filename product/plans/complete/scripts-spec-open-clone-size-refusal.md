# Scripts spec's Open and Clone sentences omit the editor size refusal

**Complexity: 1/10** — two sentences in one spec file. No source, test, or documentation file changes, and the behavior is already correct and pinned by existing tests.

## Goal

Make the Open and Clone sections of `product/specs/scripts-tab.md` say that an oversized runscript or copy is refused, so each section agrees with the Failure text table and with the two tests that pin the behavior. This run changes no behavior.

## Problem

The Open section says the runscript opens in an editor tab, and the Clone section says the copy opens in one, with no exception. The editor refuses any file above its two-megabyte limit (`EDITOR_MAX_BYTES` in `src/openers/editor.ts`, checked as `bytes > EDITOR_MAX_BYTES`). For an oversized file nothing opens, and the notifications feed shows the `edit: <name>.rs is <size> — too large to edit in-app` line. The Failure text table states that line for Open and Duplicate, but the two sentences the reader meets first do not. A reader who takes them at face value may treat the refusal as a defect and remove it.

The behavior is pinned by two tests in `src/plugins/runscript-topic-actions.test.ts`: the test at line 375 refuses an oversized runscript in the feed instead of opening it, and the test at line 238 keeps an oversized duplicate on disk and posts the refusal for the copy. Both tests already pass on this branch, which the behavior claim depends on.

## Approach

Qualify the two sentences and point to the oversized row of the Failure text table for the exact wording. Each sentence stays a single sentence, so the rest of each section is unchanged.

The Open sentence will say the runscript opens unless the file is above the editor's two-megabyte limit, in which case nothing opens and the notifications feed shows the size refusal.

The Clone sentence will say the copy opens unless the copy is above the limit, in which case the copy is still created on disk, nothing opens, and the notifications feed shows the size refusal.

## Implementation steps

1. In `product/specs/scripts-tab.md`, Open section: replace the sentence "The runscript opens in an editor tab, as `edit <name>` opens it." with the qualified sentence that names the two-megabyte limit, the refused open, and the feed line, and points to the oversized row of Failure text.
2. In the same file, Clone section: replace the sentence "The copy holds the source file's exact text, comments and blank lines included, and it opens in an editor tab." with the qualified sentence that adds the on-disk copy and points to the same row.
3. Read both changed sentences against the two tests and the oversized row of the Failure text table, and record that the three agree.

## Tests

None added. The change alters no behavior, and the two existing tests in `src/plugins/runscript-topic-actions.test.ts` already pin the refusal that the sentences now describe. The two docs tests the task names (`src/commands.test.ts` and `src/plugins/documentation.test.ts`) are run directly after the edit, because `check-diff` runs nothing for a docs-only change. Before the edit, `src/plugins/runscript-topic-actions.test.ts` was run and all 28 of its tests passed.

## Spec

`product/specs/scripts-tab.md` changes in two sentences: the Open section sentence about opening in an editor tab, and the Clone section sentence about the copy opening in one. Nothing else in the file changes.

## Docs

None needed. `help.md` and `documentation/user-documentation/` describe the editor size refusal only for the `edit` command and describe no size behavior for the scripts tab's Open or Duplicate, and this change alters no behavior.

## Out of scope

- The pull request description. Its Flow 7 already states the refusal, and the author decides whether its Open and Duplicate steps need the same qualifier. This run leaves the body as it is.
- Any change to the editor's two-megabyte limit, the refusal wording, or the `edit` command.
- The unqualified "double-click opens that runscript in an editor tab" line in `documentation/user-documentation/command-bar/commands.md`. It describes the behavior the spec describes, but it is not part of this entry, which changes only the spec.
