# Restrict the delegation tool's reach

**Complexity: 4/10** — two guards on one module plus the primer text and the tests that pin them; no new subsystem and no protocol change.

## Goal

The delegation entry in the ACP tool table lets an agent reach any tab. `msg <tab> request <text>` runs its text through the full command dispatcher in the named tab, and `send <tab> <text>` dispatches into an agent tab's own pipeline, so both can execute `quit`, `close`, `harness`, `schedule`, or a shell command in a tab the agent does not own. Before this feature the tool loop held `browser`, `question`, and `db`, each confined to the agent's own tab.

Bound it twice: an allowlist of the commands a delegated tab may be asked to run, and a check that the target belongs to the delegating tab's group.

## Approach

Both guards live in `src/acp/delegation.ts`, beside the verbs they constrain, and both answer with an ordinary tool return value — which `runAcpToolLoop` already feeds back as the delegating agent's next prompt, the same path every other tool refusal takes.

The command allowlist resolves the text with `resolveCommand` from `src/resolve.ts`, the same classifier `src/capture/manager.ts` uses, and requires the result to be an application command whose name is on the list. Anything else — a shell command, an unprefixed unknown that the probabilistic router would send somewhere, a built-in outside the list — is refused before anything executes. `msg` allows `acp`, `state`, and `db`: a prompt, a transcript poll, and a query. `send` allows `acp` alone, because the only thing worth handing a worker without waiting is a prompt.

`send` to a harness tab types literal keystrokes into that tab's PTY, which is what `send` is for and is not a command dispatch, so the allowlist applies only when the target is an agent tab.

The group check compares the target's `group` with the delegating tab's. `placeAgent` already inherits group from the creator, so a worker's group is its delegator's and the documented workflow is unaffected. A delegating tab that cannot be found fails closed.

## Implementation steps

1. In `src/acp/delegation.ts`, add the two command sets and a helper that resolves a text against one and returns a refusal line naming what was allowed.
2. Add a helper comparing the target tab's group with the delegating tab's, failing closed when the delegating tab is absent.
3. Apply the group check in `runSend` and `runMsg` before any delivery or capture.
4. Apply the command check in `runMsg` always, and in `runSend` when the target is an agent tab.
5. Extend `DELEGATION_PRIMER` with both limits, so the agent learns them without reading the skill.
6. State the limits in `product/specs/acp.md`'s Delegation section, in the Delegating to agents documentation page, and in `skills/delegate-to-agents/SKILL.md`.

## Tests

Extend `src/acp/delegation.test.ts`, which already builds a `Managers` stub for the pure functions:

- `msg <worker> request quit` is refused, `capture.run` is never called, and the refusal names the allowed commands.
- `msg <worker> request acp "…"`, `request state`, and `request db …` reach `capture.run` with the worker's text.
- `msg <worker> request rm -rf .` and `msg <worker> request shell ls` are refused, so neither the shell keyword nor an unprefixed unknown reaches the dispatcher.
- `msg <worker> request …` against a tab in another group is refused.
- `send <worker> acp "…"` reaches `deliverTo`; `send <worker> quit` against an agent tab is refused; `send <worker> quit` against a harness tab is allowed, since that types into a PTY.
- A delegating tab with no `agentDepth` and no group entry still delegates to a group-1 worker, and fails closed against a group-2 target.

The existing recognizer, primer, and scan cases must keep passing untouched.

## Out of scope

- Group-scoped targeting in general — globs, sets, and cross-group delegation — which belongs to `product/plans/deferred/agent-self-service-tab-orchestration.md`.
- Per-worker tool allowlists and spawn scoping.
- Changing what `msg` and `send` do for a person typing them; both keep their full behavior in the command bar.