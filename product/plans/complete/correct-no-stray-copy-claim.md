# Correct the no-stray-copy claim

**Complexity: 1/10** — docs-and-spec text-only repair: no production code, tests, or new units change, and no production file is edited; all five quantitative counts are zero (p=1.578).

## Goal

Make the labelled fenced-block documentation and the PR description state what the code actually does when a command is echoed twice. `filterCommandFromDisplay` in `src/acp/loop.ts` removes exactly the block span that `extractCommandBlock` in `src/acp/command-block.ts` returns, which is the last closed labelled block. An earlier identical block, or a command repeated in prose outside the matched block, stays in the displayed reply. The current wording says the matched block is removed "so a command echoed twice leaves no stray copy" and that "the only copy left is the tool-transcript entry", which overstates the contract and contradicts the "removes only the final block when a command is echoed twice, leaving one copy displayed" case in `src/acp/loop.test.ts`.

## Approach

Rewrite four sentences in place, leaving every other character untouched: the sentence in the pull request description's "What" section that claims the tool-transcript entry is the only copy, the two "a command echoed twice leaves no stray copy" clauses in `product/specs/acp.md` (the autonomous-tool-loop paragraph and the tool-table paragraph), and the one in `product/specs/agent-command.md`. Each new sentence says the matched labelled block is removed from the displayed reply while prose outside it is kept, including an earlier identical block. No logic, extraction, or test changes: the single-block display cases in `src/acp/loop.test.ts` keep passing unchanged. The PR description is a live GitHub artifact, so its edit is applied after the fix-plan/spec commit is pushed, per Step 8.5 of the work task.

## Implementation steps

1. In `product/specs/acp.md`, rewrite the clause "the matched block is removed from the display so a command echoed twice leaves no stray copy" in the autonomous-tool-loop paragraph to say the matched labelled block is removed from the display while prose outside it is kept, so an earlier identical block or a command repeated in prose outside the block stays visible. Leave the rest of the paragraph, including the bare-final-line clause, unchanged.
2. In `product/specs/acp.md`, rewrite the clause "so a command echoed twice in a reply leaves no stray copy, while prose outside the block, including a trailing sentence, stays" in the tool-table paragraph to say the matched labelled block is removed while keeping the prose around it, so an earlier identical block or a command repeated in prose outside the block stays visible, as does a trailing sentence. Leave the rest of the paragraph unchanged.
3. In `product/specs/agent-command.md`, rewrite the same "a command echoed twice leaves no stray copy" clause in the last-closed-block paragraph the same way, leaving the rest of the paragraph unchanged.
4. In the pull request's "What" section, rewrite the sentence ending "so the only copy left is the tool-transcript entry the loop adds itself" to say the matched labelled block is removed from the displayed reply while the prose around it is kept, so an earlier identical block or a command repeated in prose outside the block stays visible. Read the live body with `gh pr view 2127 --json body`, change only that sentence, write the full body to `./temp/pr-body.md`, and apply it with `gh pr edit 2127 --body-file ./temp/pr-body.md` after the commit and push. Preserve all other content byte-for-byte, including every heading, behavior example, screenshot line, How to verify section, and the Additional test cases section. Do not change the title.
5. Run `$janissary/scripts/run.mjs check-diff` after the spec edits and confirm the full server suite stays green.

## Tests

None. This repair changes only spec and PR-description prose; no behavior, source, or test changes are needed. Existing tests, including the single-block display cases and the "removes only the final block when a command is echoed twice" case in `src/acp/loop.test.ts`, remain untouched and must pass unchanged.

## Out of scope

- Any change to `filterCommandFromDisplay` in `src/acp/loop.ts`, `extractCommandBlock` in `src/acp/command-block.ts`, or any extraction/display test.
- Duplicate-block removal or any other behavior change.
- The design-decision line in the already-complete `product/plans/complete/labelled-fenced-block.md` and any other plan file; this work corrects only the two behavior specs and the PR description named by the backlog entry.
- Any other paragraph of the PR description, the PR title, help pages, and user documentation.
