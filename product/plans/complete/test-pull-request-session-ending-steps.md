# Test task isolates testing steps that end the app's session

**Complexity: 2/10**: prose rules in three steps of one playbook, one spec sentence, and one pin assertion. The only care needed is keeping the batch and restart rules consistent with Step 8.

## Goal

`ai/tasks/test-pull-request.md` Step 7 runs every step in one driver batch. The app under test exits when its last client leaves, when its last tab is closed, and on `quit` or `exit`, as documented in `ai/tasks/workspace/start-application.md`'s "Janissary, specifically" section. A step that does one of those takes the app down, and every later step in the batch meets a refused connection and is recorded as failing. Step 8 then reruns each of those alone on a fresh app, where it passes and gets filed as intermittent. So a pull request touching tab closing or quitting yields false failures and false backlog entries.

## Approach

Three rules, one per step.

1. **Step 5, classify.** A step whose expected effect is to end the app's session (closing the last tab, quitting, stopping, or relaunching the app) is marked `session-ending`. That's a scheduling marker, not a refusal. Session-ending steps are left out of the main batch and run after it, each in its own batch on a freshly started app. Each is judged by what the app does as it ends.
2. **Step 7, detect.** The driver checks after each step whether the page closed or the app's address stopped answering. If so, it records that step as having ended the session and records every later step in the batch as `not run`, never as failed. The `not run` steps then run in a fresh batch on a restarted app before any failure is counted. A step that ended the session where neither its text nor its expected result says it should is a failure to research in Step 9, because the app went away unasked.
3. **Step 8, rerun.** A step recorded as `not run` because the session ended is never a rerun candidate and never intermittent.

Every fresh batch starts the app the way Step 8 does, by rerunning the start command and rewriting the start record. So this adds no new restart mechanism.

## Implementation steps

1. `ai/tasks/test-pull-request.md`: add the `session-ending` marker to Step 5, the detection and continuation rule to Step 7, and the not-a-rerun-candidate rule to Step 8.
2. `product/specs/pull-request-testing.md`: add one sentence saying session-ending steps run alone on a fresh app, and that steps cut off by a session ending are rerun rather than counted as failures.
3. `scripts/test-pull-request-playbook.test.mjs`: pin the marker and the rerun exclusion.

## Tests

One assertion in `scripts/test-pull-request-playbook.test.mjs` that the playbook names the `session-ending` marker and says a step cut off by a session ending is never a rerun candidate.

## Out of scope

- Changing how the app itself exits, or the `e2e-driver` runner.
- New result or `Not tested` vocabulary in the report. Cut-off steps are rerun, so each step still ends with one of the existing results.
