<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Anchor the description's verification claims to the code that proves them

Existing Issue: None of the Behavior examples transcripts, the Screenshots statement, or the Do and Expect lines in How to verify names a code path, line, or test assertion that proves the claim it makes. Severity: 4/10

Existing Risk: 4/10 - A reviewer cannot check any of those claims against the implementation, so a mistake like the zero-retention expectations is free to pass unchallenged.

Proposal Risk: 1/10 - Adding references to descriptive text carries no behavioral risk; the residual risk is only that a reference goes stale as files move.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2195 "anchor the description's verification claims". Add a code reference beside each transcript and Do and Expect line in the pull request body: point capture survival and aging claims at reapHarnessCaptures in src/harness/capture/file.ts and its call in src/main.ts; the "only direct regular .txt files" claim at reapFilesOlderThan in src/state/reaper.ts and src/state/reaper.test.ts; the "keeps the init but drops its clear" claim at STATE_DIRECTORY_ENTRIES in src/state/dirs.ts and src/state/dirs.test.ts; and the "no web UI" screenshot statement at the absence of changes under web/src/. Leave the substance of each claim untouched except where another entry corrects it.
