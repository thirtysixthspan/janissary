# Let work-pull-request-issue accept a named work item

**Complexity: 3/10** — the change is wording in one markdown task, a one-line pointer in another, a spec paragraph, a user-documentation sentence, and a new playbook test. Nothing in `src/` or `web/src/` reads these rules. The care is in keeping the explicit-target safeguards intact while the trailing text grows from a lookup into a possible new work item.

## Goal

`ai/tasks/feature/work-pull-request-issue.md` repairs a pull request on its own branch, but only for work a reviewer or tester already recorded in that branch's `./product/backlog/pull-request.md`. The text after the PR reference is a selector. When it matches no entry, the run stops. So a person who spots a problem on an open PR has to write a backlog entry, commit it, and push it before the task will fix anything.

Make the trailing text a work item, the way `ai/tasks/work-an-issue.md` treats its argument. This should work:

```
execute ./ai/tasks/feature/work-pull-request-issue.md 1916 Lookup doesn't match the visible name. The list shows a record as acp:<tab name>, but connections acp:<tab name> won't find it.
```

The task looks for a matching entry in the branch backlog first. When none matches, the text itself is the work item, fixed on PR 1916's head branch exactly as if it had been recorded.

## Design decisions

1. **Match first, then take the text at face value.** A recorded entry carries a reviewer's `Proposal`, which is the best starting point for the plan, and resolving it must also remove it from the backlog. So the trailing text is matched against the entries by title, paraphrase, or position before it is treated as new work. This is the same order `work-an-issue.md` uses against `./product/backlog/issues.md`.

2. **A position that names no entry still stops.** "The third one" against a two-entry backlog describes no work to do, so the run reports that it matched nothing and stops. Only descriptive text becomes a work item.

3. **A named work item doesn't need a backlog.** A missing or empty `./product/backlog/pull-request.md` stops a run that named nothing, as today. A run that named a work item goes on with it.

4. **A named work item is never written to a backlog.** It isn't added to the branch backlog or to `./product/backlog/issues.md`. When it wasn't listed, Step 7 leaves the branch backlog unchanged and the report says so.

5. **The target rules don't move.** The first token must still be a positive integer, `#number`, or GitHub PR URL, and the work item never stands in for one. A head branch name, a missing target, or an invocation that is only free text still stops with `Status: blocked` and `Reason: explicit pull request number, #number, or PR URL required`. The work item is fixed on that PR's head branch and nowhere else.

6. **A named work item rated 7 or higher stops,** just like a selected entry. No other entry is substituted.

7. **Description corrections follow the work item too.** Step 8 corrects the PR description only when the resolved entry, or the named work item, calls for it.

8. **The orchestrators keep working unchanged.** `build-a-feature.md` and `build-a-complex-feature.md` pass each recorded entry's summary, which still matches that entry. The review and test tasks' `Proposal` lines do the same.

## Implementation steps

1. `ai/tasks/feature/work-pull-request-issue.md`:
   - Opening paragraph and invocation line: take a recorded entry or the work item named at invocation; the invocation becomes `<number|#number|PR URL> [work item]`.
   - "Explicit target required" paragraph: describe the trailing text as a work item matched against the backlog first, and drop "never treat a selector as new work".
   - Forbidden 4: a selected entry or named work item rated 7 or higher stops.
   - Forbidden 7: work comes from the branch backlog or the named work item; never fall back to master's issues or add a named work item to either backlog.
   - Step 1: a named work item continues past a missing or empty backlog; unmatched descriptive text becomes the work item; an unmatched position stops; the named text is the issue text when it isn't listed.
   - Step 7: leave the backlog unchanged when the named work item wasn't listed.
   - Step 8: the description-correction sub-step applies when the entry or the named work item calls for one.
   - Step 9 report: the `Issue:` and `Backlog:` lines cover an unlisted work item.
2. `ai/tasks/work-an-issue.md`: change the pointer's `<number> [selector]` to `<number> [work item]`.
3. New `scripts/work-pull-request-issue-playbook.test.mjs`.
4. `product/specs/task-picker.md`: update the "Ordinary and pull request issues" paragraphs.
5. `documentation/user-documentation/command-bar/tasks.md`: say the PR task takes a finding's summary or a description of new work.

## Tests

`scripts/work-pull-request-issue-playbook.test.mjs`, in the style of `scripts/update-pull-request-playbook.test.mjs`:

- The invocation line reads `<number|#number|PR URL> [work item]`, and `work-an-issue.md` points at the same form.
- The explicit-target paragraph still demands a PR reference and still refuses a head branch name.
- Step 1 turns unmatched text into the work item without adding it to the backlog, and still stops on a position that names no entry.
- Step 1 lets a named work item proceed past a missing or empty backlog.
- Step 7 leaves the backlog unchanged when the named work item wasn't listed.
- Forbidden 7 still bars `./product/backlog/issues.md` as a work source.

## Out of scope

- Any change to `review-pull-request.md`, `test-pull-request.md`, `build-a-feature.md`, or `build-a-complex-feature.md`.
- Changing how the PR target is validated or looked up.
- The specs for pull request review and testing, which describe recorded-entry selectors that still behave the same.

## Verification

`$janissary/scripts/run.mjs check-diff` runs the new script test. Manually: run the issue's example invocation against an open PR whose backlog holds no matching entry and confirm the run plans and fixes the named item on that PR's branch, leaves `./product/backlog/pull-request.md` unchanged, and leaves the PR open.
