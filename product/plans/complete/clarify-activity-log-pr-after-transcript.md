# Clarify the pull request's After transcript about the old log directory

**Complexity: 1/10** — 0 production lines, 0 production files, 4 requirements (p=2.71)

## Goal

Correct the open pull request's description so its "After" behavior example no longer suggests the old `.janissary/log/` directory is removed. The implemented behavior leaves pre-existing files in that directory untouched, as the spec and the verification steps already say; the transcript's final `ls` result and the sentence after it contradict that promise. This is a description-only correction — no application behavior changes.

## Requirements

1. "rewrite the After transcript's final `ls .janissary/log` result so it does not assert the directory is missing": show a pre-existing dated file still present after launch.
2. "Change the sentence that follows the transcript so it no longer claims the logger test asserts the absence of `.janissary/log`": state instead that the test only shows the logger writes nothing there, starting from a fresh temporary directory.
3. "Leave every other transcript line, anchor, behavior example, screenshot note, and verification step byte-for-byte unchanged."
4. "No source, test, spec, help, or plan change belongs here" and do not change the PR title.

## Design decisions

- Change only the two named passages; `gh pr edit --body-file` replaces the body wholesale, so preserving every other byte is this fix's responsibility.
- Show the pre-existing `2026-01-01.json` still in `.janissary/log/` after launch, matching the "Before" transcript and the spec's verification, rather than taking the fresh-project framing.
- Apply the description edit only after the commit and push, so the description cannot describe work that is not yet on the branch.
- Touch no application code: the implementation already writes only to `.janissary/logs/activity/` and the `activityLog` registry entry has no `clear`.

## Preserved behavior

None found — this change edits only the pull request description and introduces no application behavior.

## Assumptions

1. `src/activity-log/logger.test.ts:87`–`:92` is `it('writes nothing under .janissary/log', ...)`, which creates a fresh temporary directory and asserts the path is absent there — it does not remove or observe a pre-existing directory.
2. `src/state/dirs.ts:98`–`:104` defines `activityLog` with no `clear`: "No clear, deliberately: activity logs are kept for the `logRetentionInDays` window".
3. `product/specs/activity-log.md:27` states "Files left in the old `.janissary/log/` directory are neither moved nor reaped."
4. The PR body's "How to verify" Setup seeds `.janissary/log/2026-01-01.json` and Happy path 1 expects it unchanged.

## Existing functionality

1. The "Before" transcript establishes `2026-01-01.json` as the pre-existing daily file — PR body, "Behavior examples".
2. The verification Setup seeds `.janissary/log/2026-01-01.json` — PR body, "How to verify".
3. The spec records that files left in the old directory are neither moved nor reaped — `product/specs/activity-log.md:27`.

## Implementation steps

1. Read the live body with `gh pr view <reference> --json body` and save the full body verbatim to `./temp/pr-body.md`. Build/check command: `$janissary/scripts/run.mjs check-diff`.
2. In the "After" transcript of "Behavior examples", replace only the final result line `ls: .janissary/log: No such file or directory` with `2026-01-01.json`, leaving the `$ ls .janissary/log` command line and every other line byte-for-byte unchanged. Build/check command: `$janissary/scripts/run.mjs check-diff`.
3. In the sentence following that transcript, replace only the final clause "and the absence of `.janissary/log` is asserted by `src/activity-log/logger.test.ts:87`." with wording that the test shows the logger writes nothing under `.janissary/log` from a fresh temporary directory and does not show an existing directory being removed. Leave the rest of the sentence byte-for-byte unchanged. Build/check command: `$janissary/scripts/run.mjs check-diff`.
4. Confirm the prepared body differs from the live body at exactly those two spots, then, after the commit and push in Step 8, apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Build/check command: `$janissary/scripts/run.mjs check-diff`.

## User interface

None — the corrected artifact is the pull request description on GitHub, not an application UI surface.

## Tests

No tests. This plan changes no application behavior and introduces no code, so no test cases are added. Tests of documentation should not be introduced.

## Out of scope

- No source, test, spec, help, or other plan changes.
- No change to the PR title, to other description paragraphs, to other behavior examples, anchors, the screenshot note, or verification steps.
- No merge or close of the pull request; it stays open.
- No change to backlog entries other than removing this resolved one.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; expect a clean run because no source files change.

Manual reading check: read `./temp/pr-body.md` and confirm (a) the After transcript's final `ls .janissary/log` result is `2026-01-01.json` and not a "No such file or directory" line, (b) the following sentence's final clause describes the test as proving only that the logger writes nothing under `.janissary/log` from a fresh temporary directory, and (c) every other transcript line, anchor, behavior example, screenshot note, and verification step is unchanged from the live body. After applying the edit, read the live body with `gh pr view <reference> --json body` and confirm it matches `./temp/pr-body.md` exactly. A failure looks like the live body still containing `ls: .janissary/log: No such file or directory` or the old "absence ... is asserted" clause.
