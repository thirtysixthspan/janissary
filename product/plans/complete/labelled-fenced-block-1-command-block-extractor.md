# Labelled fenced block 1 — shared command-block extractor

**Complexity: 5/10** — ~90 added lines in one new module plus a repointed helper, 13 requirements and 11 scenarios (p=5.66)

Add the pure, shared extractor that both ACP tool-loop paths will use, along with the three-variant result type that lets the caller tell a final answer from a bad block. This is the foundation: it introduces the module and its behaviour but does not yet change what the loop or the tool table do with it.

The source of this work is `./product/plans/complete/labelled-fenced-block.md`. This subplan has no earlier subplan to depend on.

## Goal

Introduce `src/acp/command-block.ts` as a new pure module exporting one block-aware extractor and its result type. The extractor reads the last closed fenced block whose info string is exactly `janissary` and decides whether that block holds one runnable command, a correctable mistake, or no labelled block at all. Move the existing backtick/tilde fence helpers into this module so the new extractor and the agent path share one set of fence rules.

## Design decisions

- The result type has three variants and is exported from the new module. `one` carries the command text plus the span of the block it came from, so the display filter in a later subplan can remove exactly that block. `mistake` means a labelled block was present but held zero or more than one command. `absent` means the reply had no labelled block. A plain `string | null` cannot express this, which is why the type exists.
- The label is a fenced block whose info string is exactly `janissary`, case-sensitive and with no extra words. Both backtick and tilde fences count, matching the fence types the current agent extractor recognizes. A fence with any other info string (`janissary sh`, `Janissary`) is an ordinary example and is ignored, not a candidate.
- Only the last closed labelled block in the reply is a candidate. An unclosed labelled fence is present but not closed, so it yields `mistake` with zero commands, not `absent`. Nesting and unlabelled fences must not confuse which block is last; reuse the existing module-private helpers' matching rule (a closing marker must match the opening character and be at least as long) rather than inventing a new one.
- Command-start detection uses `nativeCommandName` from `src/acp/native-commands.ts:13` (`nativeCommandName`), already the vocabulary test in `toolExtractor`. That covers subagent, tab, notify, question, and the database fall-through in one place.
- For each non-empty line inside the chosen block, trim it and strip a leading `janissary ` prefix (case-insensitive, as the old agent path did) before testing it as a command-start line. A line whose first word matches a known native command is a command-start line.
- Exactly one command-start line means the whole trimmed block content, with internal newlines preserved, is the one command, with the leading prefix removed from that line. Zero or more than one command-start line yields `mistake`. Prose lines inside the block do not count as commands.
- The extractor takes an `allowQuestion` option that preserves the agent path's current behaviour: when it is false, a `question ask|approve` line is not a command-start line, so a block containing only that line is treated as having zero commands (`mistake`), and the caller will correct the agent.
- Put this in a new module rather than growing `src/acp/tool-table.ts`, which is already 198 lines against the 200-line `max-lines` rule in `eslint.config.mjs:62`.
- Move the `CodeFence` type at `src/agent/command-extract.ts:1` together with `openingFence` (`:3`) and `closesFence` (`:11`) into this module and export them for now, then change `src/agent/command-extract.ts` to import them from the new module so it still compiles. The old file is retired in subplan 3; do not re-derive the fence rules in two places. New relative imports use `.js` extensions per the NodeNext rule in `AGENTS.md`.
- The extractor takes an `allowQuestion: boolean` option (required, no default) so the decision is not left to the implementer. The agent path supplies `snapshot.askUser`; the core path supplies `true`, because question is an ordinary granted tool there. Record both call sites in this plan even though the wiring itself lands in subplan 3.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this subplan reuses it |
| --- | --- | --- |
| `src/agent/command-extract.ts:1` (`CodeFence`), `:3` (`openingFence`), `:11` (`closesFence`) | Recognize backtick and tilde fences and matching closing markers, including the length rule | Move the type and both helpers into `src/acp/command-block.ts` unchanged and export them; import them back into `src/agent/command-extract.ts` so the old extractor keeps working until it is retired. |
| `src/acp/native-commands.ts:13` (`nativeCommandName`) | Tests whether a line names a known Janissary command | Call it as the command-start predicate; do not build a second vocabulary check. |
| `src/acp/command-line.ts:6` (`cleanCommandLine`) | Trims leading whitespace/backticks/prompt markers and trailing backticks | Leave it unchanged. This module's own fence scan handles block lines; `findLastCommandLine` stays for the three legacy whole-reply extractors. |

## Proposed changes

Create `src/acp/command-block.ts`. Describe the extractor in prose as a bottom-up scan for the last closed labelled fence, then a per-line command-start count inside that block, returning one of the three variants with the block's character span for `one`. Keep the module pure: no I/O, no managers, no side effects, consistent with the "parse pure, execute effectful" principle in `ai/guidelines/architecture-principles.md`. Name the exported symbols clearly and describe their contracts in the plan; do not write implementation code here.

Update `src/agent/command-extract.ts` only enough to keep it compiling: delete its local fence helpers and import the moved ones from `../acp/command-block.js`. Its `extractAgentCommand` behaviour must stay exactly what it is today in this subplan, because the loop still calls it through the old contract until subplan 3.

## Implementation steps

1. Add `src/acp/command-block.ts` with the exported result type and pure extractor, moving the two fence helpers into it.
2. Point `src/agent/command-extract.ts` at the moved helpers so its current behaviour is unchanged.
3. Add `src/acp/command-block.test.ts` covering the cases below, following the colocated Vitest conventions for `src/` (server project).

## Tests

New `src/acp/command-block.test.ts`:

- A fence with info string exactly `janissary` and one command-start line yields `one` with the whole trimmed block as the command and a span covering the opening fence, contents, and closing fence.
- The last of several closed labelled blocks wins; earlier labelled blocks and unlabelled blocks are ignored.
- An unclosed labelled block yields `mistake` with zero commands; a reply with no labelled fence at all yields `absent`.
- An unlabelled fence, a fence with info string `janissary sh`, and one with `Janissary` are treated as ordinary examples and yield `absent`.
- A bare command line outside a labelled block yields `absent`, even when it is the reply's final line.
- Zero command-start lines and more than one command-start line both yield `mistake`.
- Command arguments spanning several lines are preserved, with internal newlines intact, in the `one` command.
- Prose after the labelled block does not suppress the command.
- A leading `janissary ` prefix inside the block is stripped from the returned command.
- With `allowQuestion` false, a `question ask` line does not count as a command-start line, so the block is `mistake`; with it true, the same line counts.
- Tilde fences and backtick fences are both accepted, and a closing marker that does not match the opening fence character or length does not close the block.

`src/agent/command-extract.test.ts` stays as it is for now; its cases are folded into this new file and the file is deleted in subplan 3. `src/acp/command-line.test.ts` stays unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the change. Typecheck must stay green: only the new module is added and the old extractor is repointed at the moved helpers, with no caller yet consuming the new result type. Confirm `src/acp/tool-table.ts` is still under 200 lines and grep for `CodeFence`, `openingFence`, and `closesFence` to confirm `src/agent/command-extract.ts` imports the single definition rather than keeping a second copy.

## Out of scope

- Changing the loop, `AcpLoopDeps.extractCommand`, `toolExtractor`, `driveToolLoop`, the primers, the specs, or any existing loop test. Those land in later subplans.
- Deleting `src/agent/command-extract.ts` or `src/agent/command-extract.test.ts`; that is subplan 3.
- Changing the label text, the correction sentence, the 8-step cap, the gate, or command permissions.
- Adding a bare-line fallback or any second command per turn.
