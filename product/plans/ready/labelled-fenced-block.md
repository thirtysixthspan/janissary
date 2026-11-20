# Labelled fenced block

**Complexity: 7/10** — ~110 added lines across 7 existing files, 14 behavioral requirements and 20 test scenarios, driven by a new shared block extractor plus a loop result-type change (p=6.56).

Shift the ACP tool loop from reading a bare command on the reply's last line to reading it from a labelled fenced block. The agent places its one command inside a final block tagged with a known label; the host reads only the last such closed block. This keeps one command per turn while letting prose follow the command, letting arguments span multiple lines, and keeping an echoed command from leaving a stray copy in the transcript. It matters because the current final-line rule makes an ordinary trailing sentence silently end the loop and forces even multi-line arguments onto a single line.

## Design decisions established by the feature text or existing behavior

- One command runs per turn; this does not change.
- The command comes from a fenced block tagged with a known label, not from the reply's last bare line.
- The label is a fence whose info string is exactly `janissary` (case-sensitive, no extra words); both backtick and tilde fences are accepted, matching the fence types the current extractor already recognizes. A fence with any other info string is an ordinary example and is ignored.
- The host reads only the last such closed block in the reply; an unclosed labelled block is not a candidate and counts as zero commands.
- Zero commands or multiple commands in that block are a correctable mistake, not a reason to end the turn: the agent is given the problem and allowed to correct it.
- Both mistakes get the same short feedback sentence, held as one constant in `src/acp/loop.ts`: ``Your reply must contain exactly one command inside a final ```janissary fenced block. Try again.``
- A `janissary ` prefix on the command line inside the block is tolerated and stripped before gating; the primer teaches the bare form.
- Prose after the command no longer terminates the loop.
- Command arguments may span multiple lines inside the block. The whole trimmed block content, newlines included, is the command when the block contains exactly one command-start line; a command-start line is a line whose first word matches a known Janissary command.
- A command echoed twice in a reply leaves no stray copy in the displayed transcript.
- The core host loop and the agent-driven path converge on the same block rule.
- The old top-of-line `janissary ` marker becomes redundant inside a block.
- There is no bare-line fallback: a final command line outside a closed labelled block is prose and ends the turn as the final answer.
- Correction feedback does not consume the 8-step budget; only commands that actually run do. There is no separate cap on correction attempts — an agent that never emits a valid block can keep being asked to correct itself, which the plan records as a risk rather than adding a new limit.

Together with the feature text these points settle every product decision for this version: the primary flow, the edge cases, the scope boundary, and all user-visible wording.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this plan reuses it |
| --- | --- | --- |
| `src/acp/loop.ts` (`runAcpToolLoop`, `filterCommandFromDisplay`) | Shared loop for both paths: streams a turn, calls an injected `extractCommand`, runs the command, feeds back output, caps steps, and removes the emitted command from the displayed reply. | Keep the loop and its injected extractor seam; change what the extractor returns and how the display filter removes the block. |
| `src/acp/command-line.ts` (`cleanCommandLine`, `findLastCommandLine`) | Pure line cleanup and bottom-up line scan used by the core extractor and by three other whole-reply extractors. | Leave unchanged; the new block extractor uses its own fence scan, and these helpers still serve `src/database/primer.ts:30`, `src/question-command.ts:44`, and `src/browser/command.ts:87`. |
| `src/acp/tool-table.ts` (`toolExtractor`, `AcpTool.isCommandLine`, `gateCommand`) | Core path: last command-shaped line wins regardless of tool owner; the gate decides permission and which side runs it. | Keep the table, predicates, and gate; change extraction to select the command from the labelled block instead of a bare line. |
| `src/acp/command-protocol.ts` (`commandProtocolPrimer`) | Tells the core role to end its reply with one bare command line and no code fence. | Rewrite the instruction to describe the labelled block without changing the other protocol rules. |
| `src/agent/command-extract.ts` (`openingFence`, `closesFence`, `extractAgentCommand`) | Agent-driven path: its module-private fence helpers recognize backtick/tilde fences, and `extractAgentCommand` requires the `janissary ` marker and special-cases `question` when allowed. | Move the fence helpers into the new shared module rather than re-deriving their rules, retire `extractAgentCommand` and its file, and let the agent path call the shared extractor directly; the marker requirement and its own fenced-content scan go away. |
| `src/agent/command-tools.ts` (`agentPrimer`) | Tells an agent run to end its reply with one `janissary <command>` line. | Rewrite the instruction to describe the labelled block. |
| `src/acp/drive-loop.ts` (`driveToolLoop`) | Chooses extractor and primer per snapshot kind and drives the shared loop. | Point both snapshot kinds at the one shared block extractor. |
| `product/specs/acp.md`, `product/specs/agent-command.md` | Define the current last-command-line rule, the 8-step cap, and that a command inside a fenced block is treated as an example. | Update the loop and agent-command sections to the block rule. |

## Proposed changes

Add a new pure module `src/acp/command-block.ts` holding the one shared block-aware extractor and its result type. The result type has three variants, because `null` alone cannot tell a final answer from a bad block: `one` (one command plus the span of the block it came from, so the display filter can remove exactly that block), `mistake` (a labelled block was present but held zero or more than one command), and `absent` (no labelled block in the reply). The loop maps these to run a command, send the correction sentence, and end the turn as a final answer respectively. Put this in a new module rather than growing `src/acp/tool-table.ts`, which is already 198 lines long, so the new pure logic does not risk the 200-line `max-lines` limit in `eslint.config.mjs:62`.

The extractor scans for the last closed fence whose info string is exactly `janissary`. Move the existing module-private `openingFence` and `closesFence` helpers out of `src/agent/command-extract.ts:4` into this module rather than re-deriving their backtick and tilde fence rules. An unclosed labelled fence is present but not closed, so it yields `mistake` with zero commands; a reply with no labelled fence at all yields `absent`. For each non-empty line inside the chosen block, strip a leading `janissary ` prefix before testing it as a command-start line; use `nativeCommandName` from `src/acp/native-commands.ts:13` (already the vocabulary test in `toolExtractor` at `src/acp/tool-table.ts:195`) so subagent, tab, notify, question, and the database fall-through are all recognized. Exactly one command-start line means the whole trimmed block content, with internal newlines preserved and the leading prefix stripped, is the one command; zero or more than one yields `mistake`. Preserve the agent path's `allowQuestion` behavior from `src/agent/command-extract.ts:16`: when `snapshot.askUser` is false, a `question ask|approve` line is not a command-start line, so the block is treated as having zero commands and the agent is corrected.

`src/acp/types.ts:84` changes `AcpLoopDeps.extractCommand` from `(text: string) => string | null` to the new result type; `src/acp/loop.ts` reads its three variants. `filterCommandFromDisplay` in `src/acp/loop.ts:82` changes its input from a command string to the matched block span: it removes the opening fence, the block contents, and the closing fence of exactly the block the extractor used, then trims trailing blank lines as it does today. Prose outside that block is kept, so the only remaining copy of the command is the loop's own tool transcript entry.

`src/acp/tool-table.ts` keeps `AcpTool.isCommandLine`, `gateCommand`, and `nativeCommandName` as the definitions of a known command and its permission; `toolExtractor` at `src/acp/tool-table.ts:195` delegates to the shared extractor instead of calling `findLastCommandLine`. Retire `src/agent/command-extract.ts` after its fence helpers move: `src/acp/drive-loop.ts:74` calls the shared extractor directly, passing `snapshot.askUser` as the `allowQuestion` option for the agent kind, so there is no wrapper function and no second fenced-content scan. Do not change `cleanCommandLine` or `findLastCommandLine` in `src/acp/command-line.ts`: `extractDatabaseCommand` (`src/database/primer.ts:30`), `extractQuestionCommand` (`src/question-command.ts:44`), and `extractBrowserCommand` (`src/browser/command.ts:87`) still call `findLastCommandLine` for their own whole-reply extractors, and those stay out of this change.

`src/acp/command-protocol.ts` and `src/agent/command-tools.ts` rewrite their primers to instruct the agent to put its one command in a final fenced block whose info string is exactly `janissary`, with prose allowed afterwards, arguments allowed to span lines, and no bare-line fallback. New relative imports in `src/` use `.js` extensions per the NodeNext rule in `AGENTS.md`.

The remote path runs this same loop on the host that runs the agent: `src/remote/serve-acp-loop.ts:109` calls `driveToolLoop` on the far side. No new protocol message, RPC, or remote frame is needed; the extraction change lands wherever `driveToolLoop` runs.

## Implementation steps

1. Add `src/acp/command-block.ts` with the result type and the pure extractor, plus its unit test.
2. Widen `AcpLoopDeps.extractCommand` in `src/acp/types.ts` and update `src/acp/loop.ts` for the three variants and block-span display removal.
3. Point `toolExtractor` at the shared module, move the fence helpers out of `src/agent/command-extract.ts`, delete that file, and update `src/acp/drive-loop.ts` to call the shared extractor with `snapshot.askUser` for the agent kind.
4. Rewrite the two primers.
5. Update the affected tests and the two specs, then run `$janissary/scripts/run.mjs check-diff`. There is no dependency on another plan; keep these steps in this order so typecheck stays green at each checkpoint.

## Tests

- New `src/acp/command-block.test.ts`: a fence with info string exactly `janissary` and one command-start line yields the whole trimmed block as the command plus its span; the last of several closed labelled blocks wins; an unclosed labelled block yields `mistake` with zero commands; an unlabelled fence, a different info string (`janissary sh`, `Janissary`), and a bare command line outside a labelled block yield `absent`; zero and more than one command-start line both yield `mistake`; arguments spanning several lines are preserved; prose after the block does not suppress the command; a leading `janissary ` prefix inside the block is stripped; with `allowQuestion` false a `question ask` line does not count as a command-start line.
- `src/acp/command-line.test.ts` stays unchanged: `cleanCommandLine` and `findLastCommandLine` are not part of this change.
- Delete `src/agent/command-extract.test.ts`; fold its cases into `src/acp/command-block.test.ts` — the `janissary ` marker is not required inside a labelled block, it is still tolerated there, and a bare final command line outside a labelled block is not extracted.
- `src/acp/tool-table.test.ts` and `src/acp/drive-loop.test.ts`: core and agent-driven paths both take the command from the labelled block; gating and side selection are unchanged.
- `src/acp/loop.test.ts`: its `extractCommand` fixtures (`extractDatabaseCommand`, `extractBrowserCommand`, `extractQuestionCommand`) need a small adapter to the new result type, leaving the legacy extractors themselves untouched; a command echoed twice leaves no stray copy in the displayed reply; prose after the block is kept in the displayed reply; zero or multiple commands feed back the shared correction sentence instead of ending the turn; a correction does not advance the step counter while a command that runs does, and the 8-step cap still applies to commands run.
- `src/acp/manager.test.ts:232`: the `deps.primer` assertion that currently ends with `Write your replies in GitHub-flavored Markdown ...` must be updated for the rewritten command-protocol primer.
- `product/specs/acp.md:93` (`To run a command, end your reply with exactly one command on its own final line`), `product/specs/acp.md:103` (`Extraction selects the reply's last recognized tool line`), and `product/specs/agent-command.md:85` (`A final command line inside a Markdown fenced code block is treated as an example`) become the block rule.
- Follow existing colocated Vitest conventions for `src/` (server project).

## Out of scope

- More than one command per turn: multiple commands in the block are a correctable mistake, not parallel execution.
- A bare-line fallback: a final command line outside a labelled block stays prose and ends the turn.
- A secondary cap on correction attempts. Corrections are deliberately unlimited and do not consume the 8-step budget; the ceiling is an agent that never emits exactly one command in a labelled block and so keeps being asked to correct itself. This version accepts that possibility; if a hung run is observed, the upgrade path is a separate correction counter in `src/acp/loop.ts`, leaving the 8-step command cap unchanged.
- Changing which commands any role or skill grants, or the gate and permission rules.
- New client/server protocol messages, RPCs, or UI; the remote loop host does not change.
- Changing the label, the correction sentence, or the 8-step cap for core prompts and the step behavior for agent runs.

## Verification

- `$janissary/scripts/run.mjs check-diff` after the change.
- Manual: in a shell tab, run `ask` with a role that grants a tool. Have the model reply with prose, then a final labelled block containing one command with a multi-line argument, then a trailing sentence; confirm the command runs, the trailing prose stays in the reply, and the block is not shown twice. Repeat with zero commands and with two commands in the block and confirm the model is asked to correct itself instead of the turn ending. Repeat once through an `agent` task to confirm the same block rule applies on that path.
