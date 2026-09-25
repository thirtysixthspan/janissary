# Correct the description's error-path verification step

**Complexity: 1/10** — one step in the pull request's own description, rewritten as two. No code, no tests, no spec. The risk is only that it is rewritten against the restart budget and the fixed close reason, which is what makes this the last entry in the list.

## Summary

Step 6 of "How to verify" says to fill the browser port band so allocation fails at launch and then connect, expecting a close reason, one death report and a later connect that retries. None of the three is what happens. A full band at launch means `portsOrReport` hands the harness no browser variables at all, so there is no endpoint to connect to and nothing to retry. A start failure that repeats is reported once per attempt, not once, until the restart budget stops the tab being given a browser. A reviewer following the step cannot perform it.

## Design decisions

1. **The full band is a launch-time failure with no connect in it.** It is worth its own step because the outcome is the harness launching with no browser variables and one notification, which is a different thing from a refused connect and the only way to see that the band check reports at all.

2. **A start failure is per attempt, and bounded.** The step says what the reviewer should actually watch: each attempt closes its connect with the fixed phrase and delivers its own report, and the fourth attempt is refused outright with one last report. Wording it against a single report is what made the old step wrong.

3. **Only the step named changes.** Every other step, the behavior examples, and the reviewer notes are the author's statement of intent and stay byte-for-byte.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| What a full band does at launch | the lazy suite's full-band case | `src/browser/e2e-server-lazy.test.ts` |
| The close reason a refused connect carries | the guard's fixed phrase | `src/browser/e2e-guard.ts` |
| The budget the attempts run into | the restart limit | `src/browser/e2e-server.ts` |

## Proposed changes

1. **The pull request's description**, after the push: step 6 becomes two steps — the full band at launch, and a start failure after launch such as an unwritable browser scratch directory — each worded against what the code now does.

## Tests

None, and none possible: the artifact is prose in a pull request body, and the cases it points at are the ones the suites already pin.

## Out of scope

- No change to any other step, to the behavior examples, or to the reviewer notes.
- No change to the code, to the specs, or to the backlog beyond removing this entry.

## Verification

Read step 6 against `portsOrReport` in `src/browser/e2e-server.ts` and against the restart limit, and confirm the lazy suite's full-band case and budget cases say what the step says.
