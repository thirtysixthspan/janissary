<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Document the newly added system pause verb in the scheduling spec and the schedule help page so neither is stale.

Existing Issue: The scheduling spec still lists only list, cancel, and clear as the system management forms and quotes the pre-change usage string, while the schedule help page lists no pause form at all even though the command now pauses recurring system schedules. Severity: 5/10

Existing Risk: 5/10 - A user reading the help page never learns that recurring system schedules can be paused, and a reader of the spec gets an exact error string the parser no longer returns, so both references mislead.

Proposal Risk: 2/10 - The change is documentation only and the parser's messages are already pinned by tests, so the remaining risk is a wording mismatch that a reread against the command catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "document the new system pause verb in the scheduling spec and schedule help page". In product/specs/scheduling.md, add schedule system pause <name> to the system management forms sentence, describe that it pauses every recurring system schedule with that exact name and answers "Paused <name> in system." on success (including when the matching rows are already paused), "No recurring scheduled command "<name>" in system." when no recurring row has that name, and "Could not save system schedules." on a failed save, update the malformed-invocation example to the current SYSTEM_SCHEDULE_USAGE exported from src/schedule/usage.ts, and add pause to the list of saving operations in the durable system schedules section. In help/schedule.md, add the schedule system pause <name> usage line, a use-case bullet saying it pauses recurring project schedules, and an example. Treat the exact strings in src/commands/schedule.ts and its tests in src/commands/schedule.test.ts as the source of truth and leave those files untouched.


* Close the functionality gap where the system schedule usage text advertises a resume verb that no command path implements.

Existing Issue: SYSTEM_SCHEDULE_USAGE now lists schedule system resume <name>, but parseScheduleCommand rejects system resume <name> with that same usage error and the command dispatcher has no resume branch, so the help text promises a command that always fails. Severity: 6/10

Existing Risk: 6/10 - A user follows the printed usage, types the advertised resume command, and gets the same usage error back with no explanation, leaving a paused recurring schedule with no discoverable command to unpause it.

Proposal Risk: 3/10 - Wiring the verb touches the parser, result type and dispatcher, but the resume mutations and their tests already exist in the system schedule manager, so the remaining risk is a wrong output string or next-run value that a focused test catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "make the system schedule usage text agree with the implemented verbs". The manager in src/schedule/system/manager.ts already exposes resumeByName and resumeByKey, backed by src/schedule/system/mutations.ts and covered in src/schedule/system/manager.test.ts, but no command path reaches them. Wire resume end to end by adding a resume variant to ScheduleParseResult in src/schedule/types.ts, a system resume <name> branch in parseSystemSchedule in src/schedule/index.ts that requires a name and no trailing tokens (mirroring pause), and a resume dispatch in runSystemSchedule in src/commands/schedule.ts that calls owner.resumeByName and reports the outcome with success, no-match and failed-save messages; add parser coverage in src/schedule/index.test.ts and command coverage in src/commands/schedule.test.ts that asserts the paused flag clears and a future nextRun is stored. If resume is deliberately reserved for a later subplan, instead remove schedule system resume <name> from SYSTEM_SCHEDULE_USAGE in src/schedule/usage.ts and update the test in src/schedule/index.test.ts that pins the exact usage line so the advertised grammar names only implemented verbs. Either way, keep the usage string and the parser in agreement.
