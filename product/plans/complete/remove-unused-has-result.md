# Remove the unused hasResult helper

**Complexity: 1/10** — delete one exported function and the test written for it. No behavior changes at all.

## Goal

`web/src/multiagent/format.ts` exports `hasResult`, which answers whether a member's row has anything beyond its state, and nothing calls it.

`MemberRow` does not use it: it tests `member.state === 'failed'` and `member.state === 'answered'` separately, because it renders an error line and an answer line and has to tell them apart. The only reference anywhere in the tree is the test written for the helper itself.

An exported predicate with no caller invites the next reader to reach for it and then discover it says less than the two state checks it would replace, and the project's own end-of-work check reports it on every run as dead code.

## Approach

Delete the export and its test. Do not fold the two state checks in `MemberRow` through it — they are not redundant, and passing them through a predicate would lose the distinction the component depends on.

## Implementation steps

1. Delete `hasResult` from `web/src/multiagent/format.ts`.
2. Delete its `describe` block from `web/src/multiagent/format.test.ts`, and drop `MultiAgentMemberView` from that file's imports if nothing else there still names it — `stateWord` and `runSummary` take `MultiAgentMemberState`, `number` and an array, so the check is worth making rather than assuming.
3. Leave `MemberRow.tsx` alone.

## Tests

The remaining cases in `format.test.ts`, covering `stateWord` and `runSummary`, must keep passing untouched. No new test is needed for a deletion.

## Out of scope

- **Changing what a row renders.** `MemberRow`'s two separate state checks are what let it show an error and an answer differently.
- **The client's markdown caching**, which is the other thing in this directory with a reason to exist.

## Verification

```
./scripts/run.mjs check-diff
```

Then confirm `grep -rn hasResult web/src` returns nothing, and that the comparison tab still renders a failed member's reason and an answered member's markdown exactly as before — the render path is untouched, so this is a check that the deletion took nothing with it.
