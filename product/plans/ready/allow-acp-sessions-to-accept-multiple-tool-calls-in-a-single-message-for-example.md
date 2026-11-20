# allow acp sessions to accept multiple tool calls in a single message, for example:

**Complexity: 6/10** — ~130 added production lines across 7 files, 10 behavioral requirements, 18 test scenarios (p=6.33)

## Summary

An ACP agent that wants to investigate something with several independent commands — the backlog's example shows a `file grep`, `file glob`, another `file grep`, `file list`, and another `file glob` issued together — currently has to spend one provider round trip per command. The tool loop accepts exactly one command in a labelled reply, corrects the agent when it sends zero or more than one, and feeds that single command's output back before the agent can issue the next one. This feature lets an agent put several commands in one reply and have the host run them, so a multi-step investigation can be requested in a single message instead of five.

## Design decisions established by the feature text or existing behavior

- The feature is an extension of the existing ACP tool loop, not a new subsystem. The example is about an agent emitting several file-search commands in one message; it does not ask for a new transport, tab, command, or user interface.
- Product decision (primary flow): the agent puts **each command in its own `janissary` fenced block**, and all the blocks in one reply are the batch. A reply containing several such blocks is the normal way to request several tool calls; a single block remains valid and means one command. Blocks are identified in order of appearance, but execution is not ordered (next decision).
- Product decision (batch execution): commands in one reply **run in parallel**, not one after another. The agent is told this in the command protocol primer (“preamble”) so it knows commands in the same message run at the same time and must not depend on one another's results.
- Product decision (result delivery): **each command sends its own follow-up message to the agent as soon as it finishes**, so the agent can act on a partial result before the rest of the batch drains. Each result is recorded as its own tool entry in the connection record as it completes. Each follow-up keeps the existing `Output of <command>:` block and closing instruction lines unchanged.
- Product decision (failures): a command that throws, rejects, or is refused is **just another result**. Its error or refusal text is delivered in its own follow-up like any other output, the remaining commands keep running, and the run ends only when the agent replies with no commands. A command error no longer settles the run as `failed`.
- Product decision (cap boundary): when a batch is larger than the remaining step budget, **run only the commands that fit** and return a refusal as its own follow-up for each over-budget command. The cap is never exceeded. The refusal text is exactly `ACP: step limit reached; command not run.`
- Product decision (malformed blocks): **any bad block corrects the whole reply** — an empty `janissary` block, a block holding more than one command, or a block whose command no granted tool owns makes the whole reply a mistake: send the correction prompt and run none of its commands. A reply with no `janissary` block at all is still a final answer (`absent` in `extractCommandBlock` at `src/acp/command-block.ts:103-107`), not a correction.
- Product decision (step cap): **each command counts as one step** against the existing eight-command cap, even when a batch runs in parallel. A batch of five consumes five steps.
- Product decision (scope): **every consumer of the shared tool loop** accepts multiple commands — local ask/tell, plugin-owned sessions, agent runs, and remote-hosted loops. The far side drives the same loop through `driveToolLoop` in `src/remote/serve-acp-loop.ts:109`, so it is included; the remote caller-command forwarding flag there needs a small fix for several parallel caller commands.
- Product decision (protocol wording): **rewrite the command protocol and correction wording from scratch** around parallel batches, with the new terminology used in the primer and in `product/specs/acp.md`. The group of commands in one reply is called a **batch**. The correction sentence is exactly: ``Your reply must contain one or more commands, each inside its own ```janissary fenced block. Try again.``
- Product decision (primer text): `commandProtocolPrimer` emits exactly this text, and the spec quotes it verbatim:

> How commands work:
> - To run a command, put it inside a fenced block whose info string is exactly `janissary`. Several such blocks in one reply form a batch; each block holds one command, whose arguments may span several lines. You may write prose after the blocks. A command on a bare line outside a block is just your answer, not a command.
> - All commands in a batch run in parallel. Each result comes back as its own message starting with "Output of" and the command. Read it, then send another batch or give the final answer.
> - A command that is not allowed, is disabled, or is skipped because the step limit was reached returns its refusal as that output; do not retry it.
> - At most 8 commands run for one request, counting every command in a batch. When the task is done, reply with the final answer and no trailing command.
- Today `runAcpToolLoop` in `src/acp/loop.ts` streams a turn, extracts one command from the reply's **last** closed `janissary` fenced block (`findCandidate` in `src/acp/command-block.ts:78-101`), runs it, and feeds its output back until the agent answers or the step cap is reached. A reply with no labelled block is a final answer; a labelled block holding zero or more than one command start is a correctable mistake answered with `CORRECTION_PROMPT` (`commandFromBlock` at `src/acp/command-block.ts:56-76`). A block's command may span several lines — only lines that begin a native command count as separate commands (`isCommandStart` at `:50-54`).
- The loop's control flow is deliberately pure: rendering, command execution, extraction, the primer, the step cap, and the abort signal are all injected dependencies. Multiple commands per turn should stay inside that seam rather than reaching into live state.
- The agent-facing contract is stated in `commandProtocolPrimer` in `src/acp/command-protocol.ts` and in `product/specs/acp.md`; it currently says "exactly one command" and "One command runs per reply." Changing loop behavior without changing that primer would leave the agent being told to do the opposite of what the host now accepts.
- Each tool step is recorded as a `tool` activity entry in the connection record (command and reply as consecutive entries), and `h.ranCommand` in the loop is the hook that records it. Running several commands in one turn still needs one such entry per command so the transcript stays a faithful command/result log.
- No new client/server protocol message is implicated by the feature text. Remote ACP loops already carry multiple `acp-tool-request`/`acp-tool-result` frames per session, so a turn with several commands can reuse that correlation rather than adding a frame type.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Tool-loop control flow, turns, and follow-up prompts | `runAcpToolLoop` | `src/acp/loop.ts` |
| Extracting a command from a `janissary` fenced block; mistake vs. answer | `extractCommandBlock`, `findCandidate`, `commandFromBlock`, and the injected `extractCommand` dependency (`CORRECTION_PROMPT` lives in the loop, not here) | `src/acp/command-block.ts:103,78,56`, `src/acp/types.ts:86`, `src/acp/loop.ts:10-11` |
| Restricting extraction to commands a granted tool owns | `toolExtractor` | `src/acp/tool-table.ts:196-202` |
| Agent-facing command protocol wording | `commandProtocolPrimer` | `src/acp/command-protocol.ts` |
| Removing the matched block from the displayed reply | `filterCommandFromDisplay` | `src/acp/loop.ts:85-103` |
| Running a command and feeding its output back | `runCommand` dependency and the follow-up message | `src/acp/loop.ts:57-73` |
| Recording each command and reply in the transcript | `h.ranCommand` and `tool` activity entries | `src/acp/loop.ts:67`, `product/specs/acp.md:45` |
| Step cap, correction path, and abort handling | `maxSteps`, `CORRECTION_PROMPT`, `dependencies.signal` | `src/acp/loop.ts:24,52-54,28` |
| Remote tool-call correlation for several commands in one turn | `acp-tool-request` / `acp-tool-result` frames | `src/remote/protocol-frames.ts:307`, `src/remote/serve-acp-loop.ts:71` |
| Existing unit coverage for loop, extraction, and primer | Colocated Vitest suites | `src/acp/loop.test.ts`, `src/acp/command-block.test.ts`, `src/acp/command-protocol.test.ts` |

## Proposed changes

Land the changes in this order so typecheck and tests stay green at each step:

1. **Extraction contract, `src/acp/command-block.ts` and `src/acp/types.ts`.** Change `extractCommandBlock` (`:103`) and `findCandidate` (`:78-101`) from tracking the last closed labelled fence to collecting **every** closed `janissary` fence, and change the result shape so a valid reply carries one command and its display span per block in appearance order. Keep `isCommandStart` (`:50-54`) as the test for a command start so a command whose arguments span several lines stays one command, and keep a block with zero or two-or-more command starts a mistake. A reply with no labelled block still returns `absent`. Widen the injected `extractCommand` dependency in `AcpLoopDeps` (`src/acp/types.ts:84-91`) to this batch result; this is the seam both extraction call sites use.
2. **Granted-tool filtering, `src/acp/tool-table.ts` and `src/acp/drive-loop.ts`.** `toolExtractor` (`:196-202`) currently turns a command no tool owns into `absent`, which would silently end the run mid-batch. It must apply ownership to each extracted block and return the whole-reply mistake when any block is unowned. Update both extraction call sites in `driveToolLoop`: `toolExtractor(tools)` at `src/acp/drive-loop.ts:75` and the agent-snapshot closure using `extractCommandBlock` at `:76`. `CORE_MAX_STEPS` (`:14`) stays eight.
3. **Batch orchestration, in `src/acp/loop.ts` itself.** Launch all extracted commands in parallel, consume one step per command, and refuse each over-budget command in its own follow-up. Deliver one follow-up per finished command, with the existing `Output of <command>:` block and closing lines unchanged, queued one at a time in completion order because `startTurn`/`chunk`/`endTurn` (`src/acp/types.ts:93-115`) model a single current turn. Record each command through `h.ranCommand` as it completes. A thrown or rejected command becomes its result text (the existing `ACP error: <message>` line) instead of settling the run as `failed`; the run ends only on a reply with no commands or when the cap is hit. The `finished` handler keeps its `failed` variant for other producers, but this loop no longer emits it for a command error. `filterCommandFromDisplay` (`:85-103`) must remove **all** matched block spans, not just one. The parallel-launch, result-queue, and cap-accounting logic is roughly forty lines; added to `loop.ts`'s current 113 it stays well under the 200-line `max-lines` rule, so no new module is needed. `CORRECTION_PROMPT` stays in `loop.ts:10-11` with the exact new sentence from Design decisions.
4. **Agent-facing wording, `src/acp/command-protocol.ts` and `product/specs/acp.md`.** Rewrite `commandProtocolPrimer` to emit the exact four-bullet primer recorded in Design decisions, and keep `CORRECTION_PROMPT` and the over-budget refusal text verbatim as recorded there. In `product/specs/acp.md`, rewrite the command-exchange paragraphs that state the one-command rule and the loop's behavior (`product/specs/acp.md:89-101`, including the quoted primer at `:91-97` and the `runAcpToolLoop` paragraph at `:101`), and update the transcript/error wording where it says a command error settles the run as failed. The quoted primer, correction sentence, and refusal text in the spec must match the code exactly.
5. **Remote forwarding, `src/remote/serve-acp-loop.ts`.** The far side drives the same loop through `driveToolLoop` (`:109`), so it inherits batch behavior, but its single `forwarded` flag (`:47,82-85`) assumes one caller command at a time. Reuse the existing `pending` map of request number to deferred result (`:50`): record the command on each pending entry when `runCaller` creates it (`:65-73`), and let `ranCommand` (`:80-91`) skip the tool step only for a command that has a matching pending entry. That keeps several parallel `acp-tool-request` frames (defined at `src/remote/protocol-frames.ts:307`) correlated to their `acp-tool-result` without a new map or frame type.

## Tests

Mirror the existing colocated Vitest conventions for the ACP server area:

- `src/acp/command-block.test.ts` — several labelled blocks in one reply returned in appearance order with their spans; a command spanning several lines; an empty block; a block with two command starts; an unclosed labelled block; prose between and after blocks; and the existing one-block and no-block cases still passing.
- `src/acp/tool-table.test.ts` — `toolExtractor` keeps a block whose command a granted tool owns and treats an unowned block as a whole-reply mistake rather than a final answer.
- `src/acp/loop.test.ts` — several `janissary` blocks all run in parallel and each is recorded; one follow-up per finished command in completion order; all matched blocks removed from the displayed reply; the agent can then answer with no command; a batch that exhausts the step budget with over-budget commands refused using the exact refusal text; a malformed block sending the correction and running nothing; abort while a batch is in flight; a command that throws or refuses is delivered as an ordinary result and the run keeps going; the zero-command correction uses the new sentence.
- `src/acp/command-protocol.test.ts` — the primer states the batch form, parallel execution, and per-result follow-ups; `src/acp/loop.test.ts` asserts the correction sentence is the one in Design decisions.
- `src/remote/serve-acp-loop.test.ts` — a batch with several caller-side commands produces several correlated `acp-tool-request`/`acp-tool-result` pairs and no tool step is dropped by the forwarding logic.

## Out of scope

- New wire frames, RPCs, client UI, or command-bar changes. Parallel batches reuse the existing `acp-tool-request` correlation and need no new frame.
- Changing the eight-step cap value, the cold-start retry, or other loop behavior unrelated to accepting several commands per reply.
- Changing how a reply with no `janissary` block is handled — it remains a final answer — or removing the correction for an empty or malformed block.
- A configurable batch size, a per-command timeout, or a per-result message format other than the existing `Output of` block.

## Verification

- `$janissary/scripts/run.mjs check-diff` after each implementation step.
- Manual: in an ACP session with file tools granted, ask the agent to investigate a question that needs several file searches and confirm it can issue them as several blocks in one reply; check that each command and its output appears as its own tool entry in the connection tab, that one follow-up message arrives per finished command in completion order, and that the agent then answers without another command. Repeat on a remote-hosted session to confirm the tool results still correlate.
