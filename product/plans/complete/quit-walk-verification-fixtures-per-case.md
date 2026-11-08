# Reset Quit Walk Verification Fixtures Per Case

**Complexity: 2/10** — a targeted correction to the pull request's `How to verify` setup and a removal of its recorded backlog entry. No product code changes.

## Goal

Give each numbered quit-walk verification case a clean copy of the baseline fixtures, while keeping that case's work directory intact through any restart within the case.

## Problem

The pull request's `How to verify` setup says fixture files stay unchanged between numbered steps. Several cases start from a fresh instance and assert the original file contents, while earlier cases save edits or add an external disk change. Reusing one work directory makes those later baseline assertions depend on prior cases.

## Decision

In the `How to verify` section's Setup paragraph, replace only the sentence about fixture files staying as they are between steps with:

> Every numbered case starts with its own copy of the Setup fixtures (`alpha.txt` contains `alpha`, `beta.txt` contains `beta`, and `gamma.txt` contains `gamma`; `photo.png` is the 480×240 landscape fixture). Keep that case's work directory across any restart within the case so its result can be inspected, then discard it before the next case. Apply an explicit disk change, such as appending `external`, only to that case's copy.

Preserve the rest of the pull request body, including every other Setup instruction and verification case.

## Changes

### Pull request body, applied after the push

- `How to verify` → `Setup`: replace the single shared-fixture sentence with the per-case fixture instructions above.
- Leave every other section, paragraph, and step unchanged.

### Backlog

- Remove only the `Reset the fixture files between independent quit-walk verification cases` entry from `product/backlog/pull-request.md`.
- Preserve the exact comment-and-heading skeleton because this drains the backlog.

### Plan

- Move this plan from `draft/` to `ready/`, then to `complete/`.

## Tests

No automated tests are added because this change corrects verification instructions and changes no application behavior. Verify the target sentence occurs once in the current PR body, the replacement appears once in the published body, and the body differs only by that sentence. Run `check-diff` after each local file change.

## Spec

No spec change. The issue corrects how independent manual verification cases prepare their scratch fixtures; it does not change user-visible quit behavior.

## Docs

None needed. Help and user documentation describe product behavior, which is unchanged.

## Out of scope

- Product source, tests, and functional behavior.
- Any pull request body section or verification case other than the named Setup sentence.
- Other backlog entries or the pull request title.
