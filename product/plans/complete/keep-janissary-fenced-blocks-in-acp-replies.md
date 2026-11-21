# Keep janissary fenced blocks in ACP reply text

**Complexity: 2/10** — ~1 added line (mostly removals) in 1 production file, 2 requirements, 6 scenarios (p=3.52)

## Goal

The ACP tool loop currently removes every matched `janissary` fenced block from the reply text before it emits `endTurn`. That reply text is what the app renders as the agent's message in the connection tab's message sections and in the prompt's transcript, so the blocks the agent actually wrote disappear from the rendered message. A reader following an exchange in the connection tab cannot see which commands the agent asked for in its own words, only the separate tool entries the host recorded. The request is to stop stripping those fenced blocks: keep the agent's full reply, fences included, in the text that feeds message rendering. The commands still run in parallel exactly as before; only the displayed reply changes.

## Approach

`runAcpToolLoop` in `src/acp/loop.ts` computes a `display` value by calling `filterCommandFromDisplay` on a `batch` result. That helper walks the command block spans and splices the fenced lines out of the reply. Remove that step and emit the accumulated `buffer` unchanged from `h.endTurn`. With no other caller, delete `filterCommandFromDisplay` and its two private helpers `lineAt` and `isFence`, along with the now-unused `CommandBlockSpan` type import. Extraction, parallel launching, follow-ups, correction, and the step budget stay untouched.

Because the emitted reply is the text rendered in message sections, preserving the fenced blocks there is the whole fix: no record-shape, wire, component, or CSS change is needed. A `message` entry already renders through the sanitized Markdown path in `web/src/plugins/connections/ConnectionHistory.tsx`, which renders a `janissary` fenced block as a code block, so the preserved text appears formatted rather than as raw markup.

## Implementation steps

1. `src/acp/loop.ts`: in `promptOnce`'s `onEnd`, replace the `display` computation and `h.endTurn(display)` with `h.endTurn(buffer)`. Remove the `filterCommandFromDisplay`, `lineAt`, and `isFence` functions and the `import type { CommandBlockSpan } from './command-block.js';` line.

## Tests

- `src/acp/loop.test.ts`: retarget the tests that currently assert blocks are removed from `endTurn` so they assert the full reply, fenced blocks included, is emitted verbatim:
  - a reply with prose before a single block emits prose plus the whole fenced block;
  - a command-only reply emits the fenced block rather than an empty string;
  - the code-fence-stripping case emits the reply with its fences intact;
  - a reply with prose between and after several blocks emits all of it, fences included;
  - a reply with no block still emits its text unchanged;
  - a `mistake` reply still sends the correction and runs nothing.
- Retarget the downstream assertions that captured the stripped display text, so they expect the preserved fenced block instead: `src/acp/drive-loop.test.ts`, `src/acp/record-feed.test.ts`, `src/acp/run-prompt.test.ts`, `src/acp/plugin-session.test.ts`, `src/remote/serve-acp-loop.test.ts`, and `src/subagent/integration.test.ts`. In each, only the reply/display/answer string changes; every ordering, budget, refusal, and error assertion stays as it is.

## Spec and documentation

- `product/specs/acp.md`: in the `runAcpToolLoop` paragraph, replace the clause that says the matched labelled blocks are removed from the displayed reply with the behavior that they remain in the displayed reply while prose outside them is kept. Leave the rest of the paragraph and every quoted string as they are.
- No `help/` or `documentation/user-documentation/` change: no command, flag, key binding, or documented default changes.

## Out of scope

- Command extraction, parallel batch execution, follow-up order, the step budget, refusals, correction, and cold-start retry.
- The connection record shape, the wire contract, and the connection tab's rendering components and CSS.
- The PR description, which the resolved work item does not name.

## Verification

`$janissary/scripts/run.mjs check-diff` after the implementation step, after the tests, and over the complete change set. Never run `npm run check`.
