# Labelled fenced block 2 — loop reads the three result variants

**Complexity: 5/10** — ~55 added lines across 3 files, 9 requirements and 9 scenarios for the three-variant loop (p=5.54)

Change the core loop so it understands the block extractor's three variants: run a command on `one`, send the shared correction sentence on `mistake`, and end the turn as the final answer on `absent`. Replace line-based display removal with block-span removal so a command echoed twice leaves only the loop's own tool transcript entry, and trailing prose stays in the displayed reply.

Depends on `./product/plans/ready/labelled-fenced-block-1-command-block-extractor.md` for the result type and extractor. Source: `./product/plans/complete/labelled-fenced-block.md`.

## Goal

Widen `AcpLoopDeps.extractCommand` in `src/acp/types.ts:84` from `(text: string) => string | null` to the result type from `command-block.ts`, and rewrite `runAcpToolLoop` and `filterCommandFromDisplay` in `src/acp/loop.ts` around the three variants. A mistake must be correctable without ending the turn and without spending the 8-step command budget.

## Design decisions

- The three variants map to three loop behaviours. `one` runs the command, feeds back its output, and advances the step counter as today. `mistake` sends a short correction prompt, starts no command, and does not advance the step counter. `absent` ends the turn as the final answer. There is no bare-line fallback: a command written on a final line outside a closed labelled block is prose and ends the turn.
- The correction sentence is held as one constant in `src/acp/loop.ts`, exactly: ``Your reply must contain exactly one command inside a final ```janissary fenced block. Try again.`` Both zero-command and multiple-command mistakes use the same sentence. It is fed back as the next prompt, which starts a new turn, just as a command's output does, and it is visible on the transcript.
- Correction feedback does not consume `maxSteps`. Only commands that actually run advance the counter, so the 8-step cap still counts commands run, and `finished: 'capped'` still fires when a command is due at the cap. There is deliberately no separate cap on correction attempts: an agent that never emits a valid block can be asked to correct itself indefinitely. Record that as a risk in the plan, not as a new limit; the upgrade path (a separate correction counter in `src/acp/loop.ts`) is out of scope for this version.
- `filterCommandFromDisplay` changes its second input from a command string to the matched span carried by the `one` variant. Define the span simply as the exact character range the extractor matched: a whole labelled block for the real block extractor, a single command line for the temporary adapters below. The filter removes exactly that range, with its fence markers when the range is a fenced block, then trims trailing blank lines as it does today. Prose outside the range is kept, so a command echoed twice leaves no stray copy and the only remaining copy is the loop's own tool transcript entry. For `mistake` and `absent` there is no span, so the reply is displayed unchanged.
- Keep the injected-extractor seam and the existing handler/event flow (`startTurn`, `chunk`, `endTurn`, `ranCommand`, `finished`, `error`). The loop remains pure about control flow, with all side effects injected, as documented at the top of `src/acp/loop.ts`.
- The correction follow-up is exactly the correction sentence, with no `Output of` wrapper, sent through the same `turn()` path a command's output uses so it starts a new transcript turn and is visible there. `absent` ends the turn with `finished: 'answered'` and the full reply displayed.
- To keep typecheck green and behaviour correct at this checkpoint, adapt every existing `AcpLoopDeps.extractCommand` fixture and every assignment to `extractCommand` to the new result type. In `src/acp/drive-loop.ts:74`, wrap the current `toolExtractor` and `extractAgentCommand` results in a temporary adapter that returns the `one` variant with the span of the actual matched command line (or `absent` for null), so display removal stays correct until subplan 3 replaces the adapter with the shared block extractor. Do not change what those extractors find in this subplan, and do not emit a span that does not correspond to text in the reply.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this subplan reuses it |
| --- | --- | --- |
| `src/acp/types.ts:76` (`AcpLoopDeps`) | Injected loop dependencies including `extractCommand`, `runCommand`, `maxSteps`, and `describeCommand` | Change only the `extractCommand` field's type; keep the rest of the shape and all handlers. |
| `src/acp/loop.ts:17` (`runAcpToolLoop`) | Streams turns, calls the extractor, runs the command, feeds back output, caps steps | Keep the structure and injected side effects; add the `mistake` branch and make the `absent` branch the final answer. |
| `src/acp/loop.ts:82` (`filterCommandFromDisplay`) | Removes the emitted command line and adjacent fence markers from the displayed reply | Replace the line-rebuild with span-based removal; keep the trailing-blank-line trim. |
| `src/acp/command-block.ts` (subplan 1) | Result type with `one`, `mistake`, `absent` | Import the type; read its variants in the loop. |

## Proposed changes

Describe the loop's `onEnd` decision in prose: call the extractor, choose display handling by variant, end the turn, then either run a command (advancing the step counter) or send the correction prompt (not advancing it). Keep the cold-start empty-reply retry, abort-signal checks, and async `runCommand` awaiting exactly as they are. Anchor the correction sentence as one named constant near the top of `src/acp/loop.ts` so tests can assert against it without duplicating the literal.

Do not add implementation code to the plan. Name the constant, the variant checks, and the span shape; describe their behaviour.

## Implementation steps

1. Widen `AcpLoopDeps.extractCommand` in `src/acp/types.ts` to the result type.
2. Rewrite `src/acp/loop.ts` to read the three variants, hold the correction sentence as one constant, branch correction without advancing the step counter, and remove the matched block span from the display.
3. Add the temporary adapter in `src/acp/drive-loop.ts:74` so both snapshot kinds still compile against the widened type.
4. Update the `extractCommand` fixtures in `src/acp/loop.test.ts` (a small adapter around `extractDatabaseCommand`, `extractBrowserCommand`, and `extractQuestionCommand` that locates the matched line in the reply and returns its span), and the `deps.extractCommand(...)` assertions in `src/acp/manager.test.ts` and `src/acp/run-prompt.test.ts` to the new result shape. `src/agent/execute.test.ts` only references the `AcpLoopDeps` type and makes no `extractCommand` call, so it needs no edit. Leave the legacy extractors themselves untouched.

## Tests

`src/acp/loop.test.ts`:

- Keep the existing command-run, output-feedback, answer, step-cap, cold-start retry, primer-once, async-command, error, and throw/reject cases, adapting their extractor fixtures to the new result type.
- A command echoed twice in a reply leaves no stray copy in the displayed `endTurn`; only one block is removed.
- Prose after the block is kept in the displayed reply.
- Zero commands and more than one command in the labelled block each feed back the shared correction sentence instead of ending the turn; both use the same constant.
- A correction does not advance the step counter, while a command that runs does; the 8-step cap still applies to commands run, with `finished: 'capped'` unchanged.
- An absent block ends the turn as the final answer with the full reply displayed.

`src/acp/manager.test.ts`, `src/acp/run-prompt.test.ts`: update only the `deps.extractCommand(...)` assertions to the new result shape; keep their assertions about which commands are recognized. Leave the primer assertion at `src/acp/manager.test.ts:232` for subplan 4. `src/agent/execute.test.ts` needs no change.

`src/acp/command-line.test.ts` stays unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Typecheck must stay green across `types.ts`, `loop.ts`, `drive-loop.ts`, and every test fixture. The agent and core paths still compile through the temporary adapter; subplan 3 makes them use the real block extractor. Confirm no correction branch calls `runCommand` or advances the counter.

## Out of scope

- Switching `toolExtractor` or `driveToolLoop` to the shared block extractor, deleting `src/agent/command-extract.ts`, or folding its test file; that is subplan 3.
- Rewriting the primers or specs; subplans 4 and 5.
- A correction-attempt cap, changing the correction sentence text, changing the label, changing the 8-step command cap, or touching the gate and permissions.
- Adding a bare-line fallback or allowing more than one command per turn.
