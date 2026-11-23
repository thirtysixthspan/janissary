<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's account of why the schedule storage integration test was removed

Existing Issue: The description presents the deletion of src/schedule/system/storage.integration.test.ts as the consequence of one capture-sentinel assertion, while only one of the file's eight tests used captures and seven tested unrelated schedule storage and git behavior. Severity: 6/10

Existing Risk: 5/10 - A reviewer approves a 197-line test deletion as a narrow side effect of the retention change and never notices the unrelated integration coverage that went with it.

Proposal Risk: 1/10 - Rewording the paragraph changes no behavior; the only residual risk is that the disclosure is omitted again by a later edit.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2195 "correct the description's account of the removed schedule storage integration test". Rewrite the paragraph in the pull request body that says the file "used .janissary/captures/ as its per-run sentinel and asserted that startup cleanup deleted it" so it states that only the repeated-startup-cleanup test depended on captures and that the file's other seven tests cover snapshot round-tripping, malformed and future-version stores, atomic write failure cleanup, space-safe git excludes, tracked targets, preignored rules, and symlinked storage. State where that coverage lives after the change, and pair this edit with the entry that restores those tests rather than implying the deletion was scoped to one assertion. Do not change any source file here.


* Correct the verification steps that expect a pre-relaunch capture to survive zero retention

Existing Issue: Steps 4 and 6 of How to verify expect a capture left in place before a relaunch with logRetentionInDays set to 0 to remain present, but the sweep's cutoff is the new launch time, so a capture last modified before that relaunch is deleted. Severity: 7/10

Existing Risk: 6/10 - A verifier following the documented steps sees the expected result fail and either reports a phantom retention bug or adjusts the setup in a way that hides a real regression.

Proposal Risk: 1/10 - Correcting two Expect lines and their rationale changes no code and leaves the actual retention rule intact.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2195 "correct the zero-retention verification expectations". In the pull request body's How to verify section, change steps 4 and 6 so that with a retention of 0 the capture that must survive is one written after the relaunch, not one carried in from the earlier run; the backdated and carried-in captures are expected to be gone. Replace the step 6 rationale that says the live capture's modification time is at or after "the launch" with wording that names the current launch's cutoff from reapHarnessCaptures in src/harness/capture/file.ts, called unawaited with config.logRetentionInDays from src/main.ts. Keep the plan-accurate general rule that a file last modified at or after the current launch is never reaped. The test "uses launch as the cutoff when retention is zero" in src/harness/capture/file.test.ts and "keeps files whose mtime is at or after the cutoff" in src/state/reaper.test.ts already pin the code and must not change.


* Add the relaunch that triggers the sweep to the aged-out capture behavior example

Existing Issue: The "After — an old capture is aged out, a current one stays, other entries are left alone" transcript backdates a capture, takes a new capture, and lists a directory with the old file gone, but the sweep runs only at launch, so no deletion occurs without an intervening stop and start. Severity: 6/10

Existing Risk: 5/10 - A reader infers a continuously running reaper and relies on a retention guarantee the implementation does not give.

Proposal Risk: 1/10 - Adding two commands to a fenced transcript changes no code; the only residual risk is a reader still overlooking the launch-only trigger.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2195 "add the relaunch to the aged-out capture behavior example". In the Behavior examples block of the pull request body, insert an explicit stop and relaunch of the app between the backdate and new-capture commands and the final directory listing in that transcript, and state beside it that the deletion is performed by reapHarnessCaptures in src/harness/capture/file.ts from its single launch-time call in src/main.ts. Include the backdated capture's removal among the listed outcomes only after that relaunch, and leave the other transcripts' sequence intact. No source change is needed here.


* Anchor the description's verification claims to the code that proves them

Existing Issue: None of the Behavior examples transcripts, the Screenshots statement, or the Do and Expect lines in How to verify names a code path, line, or test assertion that proves the claim it makes. Severity: 4/10

Existing Risk: 4/10 - A reviewer cannot check any of those claims against the implementation, so a mistake like the zero-retention expectations is free to pass unchallenged.

Proposal Risk: 1/10 - Adding references to descriptive text carries no behavioral risk; the residual risk is only that a reference goes stale as files move.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2195 "anchor the description's verification claims". Add a code reference beside each transcript and Do and Expect line in the pull request body: point capture survival and aging claims at reapHarnessCaptures in src/harness/capture/file.ts and its call in src/main.ts; the "only direct regular .txt files" claim at reapFilesOlderThan in src/state/reaper.ts and src/state/reaper.test.ts; the "keeps the init but drops its clear" claim at STATE_DIRECTORY_ENTRIES in src/state/dirs.ts and src/state/dirs.test.ts; and the "no web UI" screenshot statement at the absence of changes under web/src/. Leave the substance of each claim untouched except where another entry corrects it.
