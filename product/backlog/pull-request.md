<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Drop the `hasResult` helper the comparison rows never call.

Existing Issue: `web/src/multiagent/format.ts` exports `hasResult`, which answers whether a member's row has anything beyond its state, but no component calls it — `MemberRow` tests `member.state === 'failed'` and `member.state === 'answered'` separately, because it renders an error line and an answer line and has to tell them apart — and the only reference anywhere in the tree is the test written for it. Severity: 3/10

Existing Risk: 2/10 - An exported predicate with no caller invites the next reader to reach for it and then discover it says less than the two state checks it would replace, and the dead-code scan in the project's own end-of-work check reports it on every run.

Proposal Risk: 1/10 - Deleting an export nothing imports; the residue is one fewer named concept in a four-function module.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1513: remove the unused hasResult helper from the comparison format module". Delete `hasResult` from `web/src/multiagent/format.ts` and delete its `describe` block from `web/src/multiagent/format.test.ts`, along with the now-unused `MultiAgentMemberView` import in both files if nothing else in them names it — `stateWord` and `runSummary` should be checked for that separately rather than assumed. Do not change `MemberRow.tsx`: its two separate state checks are what let it render an error and an answer differently, and folding them through a predicate would lose that. The remaining cases in `format.test.ts`, covering `stateWord` and `runSummary`, must keep passing untouched.

