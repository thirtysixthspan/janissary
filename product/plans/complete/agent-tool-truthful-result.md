# Make the agent tool's result reflect what actually happened

**Complexity: 2/10** — one guard and one branch in one function, plus their tests.

## Goal

`runAgent` checks the depth cap and the `--model` usage case, then calls `managers.profile.newAgent` and unconditionally returns "Opening agent …". The catalog refusal for an unknown model is raised later, inside `newAgentOp`, as a transcript line on the delegating tab. So a reply ending `agent scout --model not/a-model` produces both a success-shaped tool result — which is what becomes the agent's next prompt — and the refusal line, and the agent proceeds as though a worker exists.

The same return value builds its follow-up hint from `parsed.name`, which is empty for a pool-name launch, producing the unusable `msg a new agent request state`.

## Approach

Apply the same catalog check in `runAgent` that `newAgentOp` applies, using the same wording, and return it instead of launching. `newAgentOp` keeps its check: that is what refuses before a workspace clone starts, which matters for a person typing the command and is the reason a bad `--model` leaves nothing behind.

Two call sites needing the same wording and the same catalog is duplication the diff would create, so extract the refusal into a shared helper rather than restating the string.

For the hint, branch on `parsed.name` being empty and omit the `msg … request state` sentence entirely, since the pool name is only chosen inside `newAgentOp` and the tool cannot know it.

## Implementation steps

1. Export the unknown-model refusal from `src/profile/new-agent.ts` and use it from `src/acp/delegation.ts`, so one wording serves both call sites.
2. In `runAgent`, check `isKnownModel('opencode', model)` and return the refusal without calling `profile.newAgent`.
3. Omit the transcript hint for a pool-name launch.

## Tests

Extend `src/acp/delegation.test.ts`:

- `agent kaptan --model not/a-model` returns the catalog refusal and `profile.newAgent` is never called.
- `agent kaptan --model <a catalog model>` reaches `profile.newAgent`.
- A pool-name `agent --no-workspace` returns "Opening agent" with no `msg …` hint in the text.
- A named launch keeps its hint.

## Out of scope

- Changing what `newAgentOp` does, or where it refuses. The launch-time check and its position before the clone stay as they are.
- Surfacing the chosen pool name to the tool. That would need `newAgentOp` to report its resolved name, which is a larger change than this fix.