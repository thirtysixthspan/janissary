# docs(plans): reconcile the check-diff settled-guard design note

**Complexity: 1/10** — 3 requirements for one plan paragraph, no production code, test scenarios, or new units (p=2.56)

## Goal

The completed plan `product/plans/complete/check-diff-concurrency-and-failure-output.md` claims no guard flag is needed because a promise settles once and a later `resolve` is a no-op, but `runCheck` in `scripts/check-diff.mjs` carries a `settled` flag. The flag is real: `settle` calls `printFailure` before `resolve`, so a `close` that follows an `error` would otherwise print the failure block a second time. This work corrects the second Design decisions bullet to match the implementation. No code, config, spec, help page, or test changes with it: the guard is correct and stays.

## Requirements

1. The second Design decisions bullet keeps the statement that a `close` following an `error` is ignored so a check that could not start is reported as such. Proposal: "keep the statement that a `close` following an `error` is ignored so a check that could not start is reported as such".
2. That bullet no longer claims no guard flag is needed; it explains that `settle` prints the failure block before resolving, so a `settled` flag is required to stop the later `close` from printing that block a second time. Proposal: "replace the claim that no guard flag is needed with an explanation that `settle` prints the failure block before resolving, so a `settled` flag is required to stop the later `close` from printing that block a second time".
3. `scripts/check-diff.mjs` stays unchanged and the rest of the completed plan paragraph stays as written, still matching the `error` and `close` handlers and the `printFailure` call. Proposal: "Leave `scripts/check-diff.mjs` unchanged — its guard is correct — and confirm the paragraph still matches the `error` and `close` handlers and the `printFailure` call".

## Design decisions

- Edit one paragraph of the completed plan; the guard in `scripts/check-diff.mjs` is correct and is not touched.
- Keep the surrounding clauses of the bullet verbatim, changing only the incorrect claim about the guard.
- Verify by reading `runCheck` against the edited paragraph rather than running tooling: no automated test covers this path.
- Do not correct the PR description. This work item calls for no description change, and the earlier description-correction work item is separate.
- Record the fix as a new plan under `product/plans/`, rated and promoted, and remove the resolved backlog entry; these are the only repository files this fix touches.

## Preserved behavior

None found. This change edits one paragraph of a completed plan; no existing test pins that prose, and `scripts/check-diff.mjs` is explicitly left unchanged.

## Assumptions

1. `scripts/check-diff.mjs:92` "`let settled = false;`" declares the guard the implementation uses.
2. `scripts/check-diff.mjs:105-106` "`if (settled) return;`" and "`settled = true;`" stop a second settlement.
3. `scripts/check-diff.mjs:107-109` "`const result = { ...check, ...outcome, output, time: Date.now() - start };`", "`if (result.status === 'fail') printFailure(result);`", and "`resolve(result);`" show `printFailure` running before `resolve`.
4. `scripts/check-diff.mjs:112-114` "`child.on('error', (error) => {`" and `scripts/check-diff.mjs:115-123` "`child.on('close', (code, signal) => {`" are the two events that can settle the promise.
5. `product/plans/complete/check-diff-concurrency-and-failure-output.md:37` "`No guard flag is needed for this: a promise settles once, and a later \`resolve\` call is a no-op.`" is the exact claim to replace.
6. `product/plans/complete/check-diff-concurrency-and-failure-output.md:119` "No automated tests are added." and no test under `scripts/` exercises `runCheck`, so verification is reading-based.

## Existing functionality

1. The `settle` closure at `scripts/check-diff.mjs:102` "`const settle = (outcome) => {`" is the mechanism the corrected note must describe.
2. The `error` and `close` handlers at `scripts/check-diff.mjs:112` and `scripts/check-diff.mjs:115` are the two events the note says can settle the promise.
3. The Design decisions bullet at `product/plans/complete/check-diff-concurrency-and-failure-output.md:37` is the paragraph to edit.

## Implementation steps

1. **Record the fix.** Write this plan under `product/plans/draft/`, rate it, move it to `product/plans/ready/`, and promote it to `product/plans/complete/`; remove the resolved entry from `product/backlog/pull-request.md`, then commit and push that bookkeeping. These are the only repository files this fix touches. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Correct the design note.** In the second Design decisions bullet of `product/plans/complete/check-diff-concurrency-and-failure-output.md`, keep the clause that a `close` following an `error` is ignored so a check that could not start is reported as such, and replace the no-guard claim with an explanation that `settle` prints the failure block before resolving, so a `settled` flag is required to stop the later `close` from printing that block a second time. Leave `scripts/check-diff.mjs` and every other clause unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The surface is a completed plan file under `product/plans/complete/`, not an application view or terminal command.
2. The only visible change is one paragraph in the Design decisions section; the rest of the plan and `scripts/check-diff.mjs` are unchanged.
3. No command, flag, or key binding changes, so no help page is affected.

## Tests

No tests are added. The fix changes no application behavior and adds no code: it edits one paragraph of a completed plan. No automated test covers `runCheck`'s settle path, so tests of documentation are not introduced and verification is the reading-based check in Verification.

## Out of scope

- `scripts/check-diff.mjs`: its `settled` guard is correct and stays byte-for-byte unchanged.
- The rest of `product/plans/complete/check-diff-concurrency-and-failure-output.md` and every other plan.
- The PR description and title. This work item calls for no description correction; the earlier description-correction work item is separate.
- Merging or closing PR #2209; it stays open.
- User and developer documentation under `documentation/`.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. Read the second Design decisions bullet of `product/plans/complete/check-diff-concurrency-and-failure-output.md`: confirm it still says a `close` following an `error` is ignored so a check that could not start is reported as such, that the no-guard claim is gone, and that it explains `settle` prints the failure block before resolving so a `settled` flag stops the later `close` from printing that block a second time.
3. Read `scripts/check-diff.mjs:88-125` (`runCheck`): confirm `settle` calls `printFailure` at line 108 before `resolve` at line 109, the `settled` guard at lines 105-106, the `error` handler at 112-114, and the `close` handler at 115-123, so the edited paragraph matches the code exactly.
4. Confirm `scripts/check-diff.mjs` and every other plan file are unchanged in the commit, and that the PR is still `OPEN`.
