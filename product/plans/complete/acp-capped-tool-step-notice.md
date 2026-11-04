# Report the capped tool-step notice in the settled shell reply

**Complexity: 2/10** — one settlement branch composes its reply, with focused loop coverage and two documentation sentences. No protocol, record, or command-layer behavior changes.

## Goal

A shell `acp` prompt that reaches the eight-step tool cap must tell the reader the answer was cut short. The notice currently lands in the shell transcript as a separate ACP entry, but the shell renders only the one settled background reply and the connection tab renders only the recorded answer, so the cap has no visible surface. The notice becomes a trailing paragraph of that settled reply and of the record's answer.

## Decisions and dependencies

The ACP loop already reports `finished('capped', maxSteps)` after its final turn, and `runCorePrompt` owns both that callback and the settlement result. Composing the reply there reaches every settlement consumer: the command layer appends the result's reply as the one background reply, and `settleAcpPrompt` records the same reply through `answerCoreRecord`. The separate `appendAcp` cap entry is removed so the notice appears exactly once. Answer, refusal, usage, error, close, and cancellation settlements are unchanged.

The notice is appended as a Markdown paragraph after the final answer: `lastAnswer` followed by two newlines and `(stopped after <maxSteps> tool steps)`. When the filtered answer is empty, the notice is the settlement reply on its own. The record's final answer carries the same composed text.

## Existing code to reuse

| Existing mechanism | Verified reference | Reuse and required change |
| --- | --- | --- |
| Capped loop callback | `src/acp/loop.ts` (`finished(command ? 'capped' : 'answered', maxSteps)`) | Reused unchanged; its reason and step count drive the composed paragraph. |
| Settlement result | `src/acp/run-prompt.ts` (`finished` handler) | Compose the capped reply and pass it to `settleAcpPrompt`; remove the separate cap entry append. |
| Background reply | `src/acp/response.ts` (`appendAcpBackgroundReply`, used by `src/commands/acp.ts`) | Reused unchanged; it already appends the settlement result's `reply` exactly once. |
| Record answer | `src/acp/response.ts` (`settleAcpPrompt` → `answerCoreRecord`) | Reused unchanged; it already stores the settlement result's `reply` as the record's answer. |

## Implementation steps

1. In `src/acp/run-prompt.ts`, compose `reply` from `lastAnswer` and the trailing `(stopped after ${maxSteps} tool steps)` paragraph when `reason === 'capped'`, pass it to `settleAcpPrompt`, and remove the separate `appendAcp` cap entry.
2. Update the capped-path test in `src/acp/manager.test.ts` to assert the settlement reply and record answer carry the composed text and no separate cap entry is appended.
3. Add a real-loop test in `src/acp/plugin-session.test.ts` that drives nine command turns to the default cap, then asserts exactly one background reply contains the notice and the record's answer contains it.
4. Add a command-layer test in `src/commands/acp.test.ts` that a capped settlement appends exactly one background reply carrying the notice.
5. Update `product/specs/acp.md` and `documentation/user-documentation/advanced-agents/acp-agent.md` to name the settled shell reply and the record's answer as the cap's surfaces.

## Tests

- `src/acp/manager.test.ts`: the finished handler for `capped` settles with `partial\n\n(stopped after 5 tool steps)` and appends no separate cap entry.
- `src/acp/plugin-session.test.ts`: a prompt driven through eight tool steps and a ninth command settles once with a background reply containing the notice; its recorded answer contains the same text.
- `src/commands/acp.test.ts`: a capped result produces exactly one background reply whose output contains the notice.
- Existing answer, refusal, usage, error, close, and cancellation tests remain unchanged and passing.

## Out of scope

- Changing the eight-step default, loop control flow, or tool execution.
- Changing connection-tab rendering or the plugin API.
- Adding a configuration option for the cap or its notice.
- Documenting behavior that was not previously documented.
