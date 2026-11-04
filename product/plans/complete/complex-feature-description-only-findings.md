# Skip the follow-up review when a review's findings are description-only

**Complexity: 2/10** — two steps and one rule of one orchestration playbook, one spec paragraph, and a new pin test. No runtime surface.

## Goal

`ai/tasks/feature/build-a-complex-feature.md` follows every review that records findings with another review once those findings are worked: a resolution review in Step 6, another full review in Step 8. When every finding a review recorded asks only for a correction to the pull request description, that follow-up review checks no code. The repairs change nothing on the branch except their fix plans and the drained backlog file, so re-reviewing the code costs a full review cycle and finds nothing new.

Change both cycles so that, when every recorded entry is description-only, the orchestrator works those entries as usual, confirms the corrections landed, and proceeds without a resolution review, a partial review, or another full review.

## Decisions

- An entry is description-only when its `Proposal` changes the pull request description and nothing else on the branch. `work-pull-request-issue.md` still repairs it: it writes a fix plan, removes the entry, pushes, and then edits the description. That task is unchanged.
- The orchestrator classifies the entries when it reads the backlog, before any repair starts, because each repair removes its own entry.
- After the drain, the orchestrator confirms the skip is safe from evidence rather than from the classification alone: the repair range changed only fix plans under `./product/plans/complete/` and `./product/backlog/pull-request.md`, and the current description (`gh pr view <number> --json body`) carries each correction. If either check fails, the normal follow-up review runs.
- A mixed set, where any entry calls for another change, keeps the normal cycle. The skip applies only when every entry is description-only.
- The rule applies to any review in the playbook: the focused subplan review, each resolution review, and each full-PR review. Step 6's repeat loop already re-enters the new item, so a resolution review that records only description findings ends the cycle the same way.

## Implementation steps

1. `ai/tasks/feature/build-a-complex-feature.md`:
   - Opening paragraph: say a review whose findings are all description corrections needs no follow-up review once those corrections are made.
   - `Orchestration rules`: add a bullet defining description-only entries, the skip, its evidence checks, and the mixed-set fallback.
   - Step 6: item 2 classifies each recorded entry. Insert a new item 4 after the drain: when every entry was description-only and the checks pass, skip to the final confirmation without a resolution review. Renumber the following items and update the internal item references.
   - Step 8: item 2 notes, before the first repair, whether every entry is description-only. Item 3 skips the next full review when they all were and the checks pass.
2. `product/specs/pull-request-review.md`, `### Staged reviews for complex features`: describe that a review whose findings are all description corrections is not followed by another review.
3. `scripts/build-a-complex-feature-description-findings.test.mjs`: a new pin test (see Tests).

## Tests

`scripts/build-a-complex-feature-description-findings.test.mjs`, a new file in the style of `scripts/build-a-complex-feature-review-cycle.test.mjs`. It pins only the wording the skip depends on:

- `Orchestration rules` defines a description-only entry and says no follow-up review runs for description corrections.
- Step 6 classifies entries before repair and skips the resolution review when every entry was description-only.
- Step 6's repeat loop covers the new item.
- Step 8 skips the next full review when every entry was description-only.
- Both skips require the repair-range and description checks.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff`.

Manual: read Steps 6 and 8 and confirm a review that records only description findings is followed by no other review, that a mixed set still gets its follow-up review, and that the skip depends on the repair range and the live description.

## Out of scope

- `build-a-feature.md`'s own review-and-repair cycle. The request names only the complex-feature playbook.
- Changes to `review-pull-request.md`, `work-pull-request-issue.md`, `update-pull-request.md`, or any other child task.
- `help/` and `documentation/user-documentation/`. Neither describes the complex-feature review cycle.
