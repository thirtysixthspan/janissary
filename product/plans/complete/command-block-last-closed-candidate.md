# Use the last closed labelled block when a later labelled block is unclosed

**Complexity: 2/10** — ~15 added lines in one production file, 4 behavioral requirements and 3 test scenarios, no new modules (p=4.12).

## Goal

`findCandidate` in `src/acp/command-block.ts` replaces the candidate at every labelled opening fence, including a later fence that never closes. A reply with a valid closed ```janissary block followed by an unclosed labelled block therefore returns `{ kind: 'mistake', commands: 0 }` instead of running the command the agent already emitted. The extractor must return the last genuinely closed labelled block, and ask for a correction only when there is an unclosed labelled fence and no closed block at all.

## Approach

1. In `findCandidate`, stop assigning the candidate at an opening fence. Track the index and label of the currently open fence, and record a candidate only when a labelled fence's closing marker is found, overwriting the previous one so the last closed labelled block wins.
2. Track separately whether a fence is still open at the end of the reply and whether that open fence was labelled.
3. Return both the last closed candidate and the unclosed-labelled flag from `findCandidate`.
4. In `extractCommandBlock`, return `{ kind: 'mistake', commands: 0 }` only when the unclosed-labelled flag is set and no closed candidate exists; return `absent` when there is no candidate at all; otherwise extract from the last closed candidate.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `findCandidate` / `extractCommandBlock` | `src/acp/command-block.ts` | The only production file that changes; the scan and fence helpers stay as-is. |
| `commandFromBlock` | `src/acp/command-block.ts` | Reused unchanged to build the result from a closed candidate's span. |
| `openingFence` / `closesFence` / `fenceInfo` | `src/acp/command-block.ts` | Fence detection stays identical; only candidate bookkeeping changes. |
| `extractCommandBlock` suite | `src/acp/command-block.test.ts` | Existing cases pin every other branch; one new case is added. |
| `product/specs/agent-command.md` | spec | Already says the command comes from the last closed labelled block; gains a clarifying clause. |

## Implementation steps

1. `src/acp/command-block.ts`: change the internal `Candidate` type to carry a required `close`; introduce a small return shape for `findCandidate` holding an optional last-closed candidate and an unclosed-labelled flag.
2. `src/acp/command-block.ts`: rewrite `findCandidate` to remember the open fence's index and label, assign the closed candidate only on a labelled closing fence, and set the unclosed-labelled flag when the reply ends inside a labelled fence.
3. `src/acp/command-block.ts`: update `extractCommandBlock` to gate the zero-command mistake on the unclosed-labelled flag with no closed candidate, and otherwise return the result for the last closed candidate.
4. Run `$janissary/scripts/run.mjs check-diff`; confirm `src/acp/command-block.ts` stays under the 200-line limit.

## Tests

- `src/acp/command-block.test.ts`: add a case where a valid closed labelled block is followed by an unclosed labelled block, expecting `kind: 'one'` with the first block's command and span.
- Keep the existing unclosed-block-alone case (`'```janissary\nnotify hello'`) expecting `{ kind: 'mistake', commands: 0 }`.
- Keep the existing last-closed-wins, no-labelled-fence, and non-labelled-info-string cases passing unchanged.

## Spec updates

- `product/specs/agent-command.md`: clarify that a later labelled block left unclosed does not suppress an earlier closed block, and that an unclosed labelled block asks for a correction only when no closed labelled block exists.

## Out of scope

- No change to `src/acp/loop.ts`: its three-variant handling and span-based display removal stay untouched.
- No change to fence detection, command-start parsing, prefix stripping, question handling, or the correction sentence.
- No new public documentation: no help page or user-documentation page describes this extraction rule.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after adding the test; both must be clean.
- Full server suite green; no edited file exceeds the 200-line `max-lines` limit.
