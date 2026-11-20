# Correct the agent-command spec's unowned-command claim for agent runs

**Complexity: 1/10** — a single sentence rewritten in one spec file; no production code, no tests, no new units (p=1.578).

## Goal

The "Local task execution" section of `product/specs/agent-command.md` says a block whose command no granted tool owns is one of the bad blocks that correct the whole reply and run nothing. That is true of core sessions but false of agent runs: an agent run extracts with the raw block parser, so a recognized but ungranted command is taken as an ordinary batch command, refused on its own, and the rest of the batch still runs. Rewrite the sentence so the spec agrees with the code and with its own earlier grant-refusal sentences, without changing any behavior or test.

## What the code does (verified)

`driveToolLoop` in `src/acp/drive-loop.ts` picks the extractor from the snapshot kind. A `core` snapshot uses `toolExtractor(tools)` from `src/acp/tool-table.ts`, which calls `extractCommandBlock` and then returns a `mistake` when any batch command is not owned by a granted tool. An `agent` snapshot instead uses `(text) => extractCommandBlock(text, snapshot.askUser)` directly, with no ownership check. `extractCommandBlock` in `src/acp/command-block.ts` produces a `mistake` only for an unclosed labelled fence (`commands: 0`) or a block holding no command or more than one command (`starts.length !== 1`); a recognized command such as `tab`, `subagent`, or `file glob` is a valid `batch` member because `nativeCommandName` maps it to a native command.

At run time, each batch command is gated. `gateCommand` in `src/acp/tool-table.ts` routes an agent command to `gateAgentCommand`, which refuses file mutations, glob, grep, list, stat, exists, head/tail, and web commands with `Agent: command not permitted: <command>.`; `runGrantedAgentCommand` in `src/agent/command-tools.ts` applies the same refusal to subagent, file, and web lines and to commands whose canonical name is not in the snapshot's grants. The loop (`src/acp/loop.ts`) runs every command in the batch in parallel and delivers each result on its own follow-up, so one refused command does not stop the others. `src/agent/execute.ts` wires agent runs to this loop with an `agent` snapshot, confirming the agent path uses the raw extractor. The unclosed, empty, and multiple-command cases remain whole-reply mistakes for both snapshot kinds because both extractors go through `extractCommandBlock`. The earlier grant-refusal sentences in the same spec (the `file` refusal paragraph and the `subagent` refusal sentence) already describe these per-command refusals.

## Implementation steps

1. In `product/specs/agent-command.md`, rewrite the sentence in the "Local task execution" extraction paragraph that lists "a block whose command no granted tool owns" among the bad blocks that correct the whole reply and run nothing:
   - Keep an unclosed labelled fence and a block with no command or more than one command as whole-reply mistakes that run nothing, and state that these apply to both core sessions and agent runs (they come from the shared block parser).
   - Scope whole-reply ownership correction to core sessions: there the extractor checks every command against the granted tools and rejects the whole reply when one is unowned.
   - Describe the agent-run case: a recognized but ungranted command such as `tab`, `subagent`, or `file glob` is extracted as an ordinary batch command and refused on its own with `Agent: command not permitted: <command>.`, while the remaining commands in the batch continue to run.
2. Leave the rest of the paragraph unchanged, including the shared correction sentence, the no-correction-cap risk, the prose-kept rule, and the final-answer rule.
3. Run `$janissary/scripts/run.mjs check-diff` and confirm it is green.

## Tests

None. This is a prose correction to a functional spec; no runtime behavior changes, so no source or test file is edited. Verification is reading the rewritten sentence against `src/acp/drive-loop.ts`, `src/acp/tool-table.ts`, `src/acp/command-block.ts`, `src/agent/command-tools.ts`, `src/agent/execute.ts`, and the earlier grant-refusal sentences in the same spec.

## Out of scope

- Any change to `src/`, to tests, or to runtime behavior — the code is already correct.
- `product/specs/acp.md` — its ownership-correction sentence describes core sessions and is accurate; leave it untouched.
- The PR description — the work item names no description correction.
- The backlog beyond removing the resolved entry.
