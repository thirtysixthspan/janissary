# Update agent-command spec for parallel command batches

**Complexity: 1/10** — prose-only spec edit, no production code, no tests, no new units (p=1.58)

## Goal

Bring the functional spec for `agent` runs in line with the delivered batch-capable ACP tool loop. `product/specs/agent-command.md` still documents single-command extraction from the last closed labelled block, an "exactly one command in a final block" correction sentence, and a rule that a later unclosed block leaves the last closed one in force. All three state the opposite of what the loop now does. The fix is documentation only: no source, test, config, or behavior changes.

## Approach

Rewrite only the local-task-execution paragraphs in `product/specs/agent-command.md` that describe labelled-block extraction and correction (the single-command sentence in the "Autonomous provider tool permissions" paragraph and the paragraph beginning "A run's command comes from the last closed fenced block"). Describe the delivered contract: every closed `janissary` block in a reply forms a batch whose commands run in parallel; each finished command produces its own `Output of` follow-up and its own tool entry and spends one step against the configured cap (`maxToolTurns`, default 20); an unclosed labelled block or any empty, multiple-command, or unowned block corrects the whole reply with the new `CORRECTION_PROMPT` sentence; and a reply with no labelled block is the final answer. Keep every quoted string character-for-character identical to the code. Leave `product/specs/acp.md` and all source files untouched.

## Implementation steps

1. In `product/specs/agent-command.md`, rewrite the "Autonomous provider tool permissions" paragraph's single-command sentence so each command lives in its own fenced block with info string exactly `janissary`, several blocks in one reply form a parallel batch, prose may follow, and no `janissary` prefix is required inside a block.
2. Rewrite the paragraph that begins "A run's command comes from the last closed fenced block" to describe:
   - every closed `janissary` block (backtick or tilde fence) contributing one command to a single batch, in appearance order, all run in parallel;
   - unlabelled or differently-labelled fences being ignored as ordinary examples;
   - an unclosed labelled block making the whole reply a correctable mistake regardless of any closed blocks (the old "does not suppress" rule is gone);
   - one command per block, arguments spanning lines, a leading `janissary ` prefix tolerated and stripped;
   - each finished command returning its own `Output of` follow-up and recorded as its own tool entry, each spending one step against `maxToolTurns` (default 20), so one batch can spend several steps, with over-budget commands refused as `ACP: step limit reached; command not run.`;
   - empty, multiple-command, or unowned blocks correcting the whole reply with ``Your reply must contain one or more commands, each inside its own ```janissary fenced block. Try again.`` and no step consumed, with no cap on corrections;
   - prose kept and matched blocks removed from the displayed reply; a bare command line outside a block is prose; a reply with no labelled block being the final answer that ends the run as answered.
3. Verify by direct comparison, since no test covers this prose:
   - the correction sentence matches `CORRECTION_PROMPT` in `src/acp/loop.ts`;
   - the refusal string matches `REFUSAL` in `src/acp/loop.ts`;
   - the primer wording matches `commandProtocolPrimer` in `src/acp/command-protocol.ts` and the quoted primer in `product/specs/acp.md`;
   - the step-cap naming and value match `maxToolSteps()` / `maxToolTurns` (default 20) in `src/acp/drive-loop.ts` and `src/config.ts`.
4. Run `$janissary/scripts/run.mjs check-diff` after the edit; it must stay green.

## Tests

None. This is a prose-only spec change with no behavior change, and no colocated test covers these claims. Verification is the direct string comparison in Implementation step 3 plus `check-diff`.

## Specs

- `product/specs/agent-command.md`: rewrite the two labelled-block extraction paragraphs under "Local task execution" to describe parallel batches, per-command follow-ups and tool entries and steps, whole-reply correction with the new sentence, and the no-block final answer.

## Out of scope

- Source changes anywhere under `src/`.
- Changing `product/specs/acp.md` (already describes batches; leave it byte-for-byte untouched).
- Tests, config, help pages, user documentation, PR title, and PR description.
- Any behavior change to the loop or any of its strings.
