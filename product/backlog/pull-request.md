<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Clarify the pull request description's After transcript that shows the old log directory gone, which contradicts the promise that pre-existing files stay.

Existing Issue: The After behavior example ends with `ls .janissary/log` reporting no such directory and says its absence is asserted by a test, while the same description, the completed plan, and the verification setup all say files already in that directory are left untouched. Severity: 3/10

Existing Risk: 2/10 - A reviewer reads the transcript as proof the change removes old logs, so either raises a false data-loss concern or stops checking the explicit untouched-file promise.

Proposal Risk: 1/10 - The edited transcript matches the implemented behavior; the only residual is that the fresh-project and seeded-project cases must be distinguished clearly enough that neither reading is misleading.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2201 "clarify the After behavior example's claim that the old log directory is absent". In the pull request body's Behavior examples, rewrite the After transcript's final `ls .janissary/log` result so it does not assert the directory is missing: either show a pre-existing dated file still present after launch, as product/specs/activity-log.md and the completed plan's verification describe, or state in the example that it starts from a fresh project with no old directory. Change the sentence that follows the transcript so it no longer claims the logger test asserts the absence of `.janissary/log`; that test creates a fresh temporary directory and only proves the logger writes nothing there, not that an existing directory is removed. Leave every other transcript line, anchor, behavior example, screenshot note, and verification step byte-for-byte unchanged. No source, test, spec, help, or plan change belongs here: the implementation writes only to `.janissary/logs/activity/`, and the `activityLog` registry entry in src/state/dirs.ts has no clear, so old files are already preserved.
