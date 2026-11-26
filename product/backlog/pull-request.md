<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Cover the untested by-name pause and resume paths, a technical-debt gap in the new schedule mutations.

Existing Issue: pauseSystemScheduleByName and resumeSystemScheduleByName arrive with tests that exercise only their no-op branches, so neither function's positive path — matching a schedule by id and committing the paused or resumed entry — is verified anywhere. Severity: 4/10

Existing Risk: 5/10 - A wrong predicate in either by-name wrapper would silently make pausing or resuming by name do nothing while the whole suite stays green, so the defect would surface only through the command and plugin entry points planned on top of these methods.

Proposal Risk: 1/10 - Two added tests that drive an active recurring entry through pauseByName and a paused one through resumeByName assert the in-memory list and persisted snapshot, leaving no new behavior unverified.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "add positive-path tests for pausing and resuming system schedules by name". In src/schedule/system/manager.test.ts, add one test that adds two recurring entries sharing an id and a one-shot with a different id, calls pauseByName with that id, and asserts both recurring entries carry paused with all other fields unchanged, the one-shot is untouched, and the version-2 snapshot persists that state; add a second test that pauses a recurring entry, calls resumeByName with its id, and asserts the paused flag is gone, nextRun lies in the future, and the persisted snapshot matches. Leave the existing no-save tests untouched because they pin the no-op branches. No source change is expected unless a new test exposes a defect in the name predicates in src/schedule/system/mutations.ts, in which case correct the predicate there and keep the by-key behavior identical.
