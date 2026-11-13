<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle an edit whose old text is a lone surrogate, which can split a surrogate pair and leave malformed text behind.

Existing Issue: `replaceExactText` accepts any `oldString`, and the subplan's premise that a malformed one "simply finds no match" is false: a lone low or high surrogate matches half of an astral character's surrogate pair, so replacing it leaves an unpaired surrogate in the result text. Severity: 4/10

Existing Risk: 5/10 - Once plan 6b writes the result, the unpaired surrogate is encoded as U+FFFD, silently corrupting an emoji or other astral character in a file the agent only meant to edit around.

Proposal Risk: 2/10 - Refusing an ill-formed `oldString` closes the split-pair path; a regression would surface only if the new test were removed, since no caller exercises it yet.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "refuse an ill-formed oldString so an edit cannot split a surrogate pair". In `src/file-write/edit-text.ts`, make `replaceExactText` return `failureResult<EditedText>(NO_MATCHING_TEXT_REASON)` when `!oldString.isWellFormed()`, checked alongside the existing empty-`oldString` guard before `countMatches`, so a lone surrogate can never match inside a pair (a well-formed `oldString` cannot split a pair in well-formed text). Add a case to `src/file-write/edit-text.test.ts` under "replaceExactText matching": text containing `String.fromCodePoint(0x1f600)` with `oldString` `String.fromCodePoint(0xde00)` is refused with `NO_MATCHING_TEXT_REASON`. Update the design-decision bullet in `product/plans/complete/janissary-hosted-agent-write-tool-6a-edit-text-replacement.md` that says `oldString` is not checked, so the plan states the new rule. Existing tests in that file must keep passing; verify with `$janissary/scripts/run.mjs check-diff`.
