# Correct the connect-triggered browser pull request's description

**Complexity: 2/10**. No code changes. The pull request's body is edited after the push, keeping the author's structure and every accurate sentence as written. The care is in reading each claim against the branch rather than against the first commit's message.

## Summary

The description of pull request 1201 describes the first commit rather than the branch as it now stands. Seven claims are out of date:

- It says a rejected supplier closes the client "with the reason the rejection carries". It now closes with a fixed phrase, or with the budget refusal's own phrase.
- It describes `e2e-server.ts` as keeping a separate eager sequence. It is now one builder with an optional kick.
- It counts 17 cases in the lazy suite, which now has 27. It also counts five new guard cases, which is now seven.
- It omits the readiness wait, `e2e-ready.ts`, `e2e-refusal.ts` and their suite, `src/tab/view.ts` and its test, `product/specs/tabs.md`, `product/specs/remote-server.md`, both user-documentation pages, and the follow-up plans from "Files changed".
- It mentions the restart budget only inside a verification step.
- It says `e2e-spawn.ts` is shared by "both start sequences".
- Its reviewer notes say the `remote-server.md` and `tabs.md` gaps are deliberately not addressed, although later commits on the branch address both.

A reviewer judging the merge from it would skip the readiness wait, the restart budget and the guard-failure teardown as unreviewed changes, and would read two closed spec gaps as open.

## Design decisions

1. **Edit only what is wrong.** `gh pr edit` replaces the body wholesale, so the revised body is the current body with named sentences replaced or added, and every other paragraph byte-for-byte. The title is not touched.

2. **Describe the branch at the time of the edit.** The budget refusal's close-reason fix has already landed, so "What" names both phrases a rejected client can receive. The plan count includes this plan, since it is pushed before the body is edited. A later fix that lands without the body being revisited will drift it again, which a later review catches the same way this one did.

3. **The follow-up behaviors get their own paragraph in "What".** The readiness wait, the restart budget and the guard-failure teardown change what a client and a human see. A verification step is not where a reviewer looks for them.

## Proposed changes

1. **"What".** Replace "closed with the reason the rejection carries" with the fixed phrase and the budget refusal's phrase. After the paragraph on a browser's death, add a short paragraph with three points. The held connect is answered only once the browser's port is accepting, bounded at thirty seconds. Three starts in a row that fail, never start listening in time, or die within thirty seconds of coming up stop the tab being given another browser. And a guard that cannot listen releases the live browser the way closing the tab does.

2. **"Files changed".** Describe `e2e-guard.ts`'s rejection handling as the fixed phrase with the refusal pass-through. Describe `e2e-server.ts` as one builder with an optional kick, with `startE2EBrowserServer` being the builder plus an immediate `ensureUpstream`, and name the budget and the guard-failure teardown. Stop describing `e2e-spawn.ts` as shared by two sequences. Add `e2e-ready.ts`, `e2e-refusal.ts`, `src/tab/view.ts`, `e2e-ready.test.ts` and `src/tab/view.test.ts`. Add `product/specs/tabs.md`, `product/specs/remote-server.md`, `documentation/user-documentation/advanced-agents/harness.md`, `documentation/user-documentation/getting-started/tabs.md`, and the follow-up plans under `product/plans/complete/`. Correct the lazy suite's count to 27 and the guard suite's new cases to seven, and mention the readiness, guard-failure and budget blocks.

3. **"Notes for the reviewer".** Replace the "Two known-gaps, deliberately not addressed here" bullet with one saying how they were resolved. The flag documentation now describes the launch flag and the gone report, and the remote spec says the far side starts its guard at spawn and its browser on the first connect.

## Tests

None. This changes no code. Verify by reading the new body against `git diff origin/master...HEAD --stat` and the per-suite `it(` counts.

## Out of scope

- The title, the behavior examples, and the "How to verify" steps, which remain accurate.
- The note on the unrelated red check gate, which the entry does not name.

## Verification

Read the body back with `gh pr view 1201 --json body` after the edit and confirm every file in the diff stat is accounted for.
