<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's citation for the no-clear-at-launch verification step, which points at the logger test instead of the state-directory test.

Existing Issue: How to verify edge case 9 cites `src/activity-log/logger.test.ts` for the "never clears the activity log directory" test, but that test exists only in `src/state/dirs.test.ts`, so the claim cannot be checked where the description sends the reader. Severity: 2/10

Existing Risk: 2/10 - A reviewer follows the citation, finds no such case in the logger test, and either distrusts a correct claim or skips confirming that the activityLog registry entry has no clear function.

Proposal Risk: 1/10 - The corrected citation points at the real assertion in the state-directory test; the only residual is that the test checks the registry entry's shape rather than exercising a launch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2201 "correct the no-clear verification citation in the pull request description". In the pull request body, change the Expect line of How to verify edge case 9 (No clear at launch) so the "never clears the activity log directory" assertion is attributed to src/state/dirs.test.ts rather than src/activity-log/logger.test.ts, keeping that line's src/state/dirs.ts and product/specs/activity-log.md anchors as they are. Read src/state/dirs.test.ts first to confirm the test's exact title, and leave every other Behavior example, screenshot note, and verification step byte-for-byte unchanged. No production code or test change belongs here: the registry entry in src/state/dirs.ts and its test already pin the no-clear behavior.


* Update the completed activity-log plan's change-set statistics so they match the requirements, steps, and tests it now describes.

Existing Issue: The plan's complexity line still says 24 requirements, 10 test scenarios, and ~35 added lines while the file lists 26 requirements and 17 named test scenarios, and the Implementation steps intro still says the work landed in four steps while five are listed. Severity: 2/10

Existing Risk: 2/10 - A reader sizing the change or checking coverage from the header misses the two requirements and the fifth fix step that were folded in, and treats the plan's accounting as authoritative.

Proposal Risk: 1/10 - Corrected counts describe the file that is actually present; the only residual is that the numbers drift again if the plan is edited later.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2201 "update the completed activity-log plan's stale change-set statistics". In product/plans/complete/activity-logs.md, recount the numbered Requirements, the test scenarios named in the Tests section across the logger, reap, state-directory, and controller test files, and the numbered Implementation steps, then replace the stale figures on the complexity line and the "four steps" phrase in the Implementation steps intro with the actual numbers. Keep the 6/10 complexity rating and its rationale unchanged, and confirm by rereading the file that every stated count matches its section. Do not alter any requirement, design decision, preserved-behavior entry, or verification step to make the numbers fit.
