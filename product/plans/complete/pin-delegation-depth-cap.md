# Pin the delegation depth cap against its bypass

**Complexity: 2/10** — two test cases in one file; no source change.

## Goal

The delegation depth cap was bypassable: `runMsg` handed its text to `managers.capture.run`, which resolved `agent` as a registered command and called `newAgentOp`, a path with no depth check. A tab at the cap could therefore still open a worker with `msg <tab> request agent <name>`.

`restrict-delegation-reach` closed that route as a side effect — `msg` now refuses any command outside `acp`, `state`, and `db`, and `agent` is not among them. The behavioral fix is already on the branch. What is missing is the test that says so, so the next change to the allowlist cannot quietly reopen the hole.

## Approach

Two cases in `src/acp/delegation.test.ts`, reusing the `harness()` stub that entry added:

- `msg <worker> request agent kaptan` is refused, and `profile.newAgent` is never called. This is the bypass itself: the assertion is on the spy, not only on the message, so a refusal that still launched would fail.
- The `agent` verb at `MAX_AGENT_DEPTH` is refused with the cap message, and below the cap it reaches `profile.newAgent`. That pins the cap the plan named while the bypass test pins the way around it.

## Out of scope

- Moving the depth check into `newAgentOp`, which would cap a person typing `agent` by hand. `product/plans/complete/delegate-to-agents.md` decision 19 deliberately excludes that and `product/specs/agents.md` does not mention it.
- Broader group-scoped targeting, which belongs to `product/plans/deferred/agent-self-service-tab-orchestration.md`.