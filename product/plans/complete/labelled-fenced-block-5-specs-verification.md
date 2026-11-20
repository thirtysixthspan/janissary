# Labelled fenced block 5 — specs and end-to-end verification

**Complexity: 1/10** — spec-only edits with no production files, 5 requirements and 4 manual scenarios (p=3.44)

Update the two behaviour specs to describe the labelled-block rule and run the full diff-scoped checks plus a manual end-to-end pass on both the core shell path and the agent path. This is the integration and verification step where the earlier pieces meet; it leaves no implied cleanup.

Depends on all earlier subplans: `./product/plans/ready/labelled-fenced-block-1-command-block-extractor.md`, `./product/plans/ready/labelled-fenced-block-2-loop-result-contract.md`, `./product/plans/ready/labelled-fenced-block-3-extractor-wiring.md`, and `./product/plans/ready/labelled-fenced-block-4-primers.md`. Source: `./product/plans/complete/labelled-fenced-block.md`.

## Goal

Bring `product/specs/acp.md` and `product/specs/agent-command.md` in line with the shipped behaviour, then verify the whole change with the project's diff-scoped gate and a manual run through both paths. Per `ai/guidelines/architecture-principles.md`, a behaviour change updates its spec in the same change, and the specs are the source of truth when behaviour is ambiguous.

## Design decisions

- In `product/specs/acp.md`, update the autonomous-tool-loop section in three places. The quoted command-exchange protocol at lines 91–97 copies the primer text verbatim, including the line at 93 that says to end the reply with one command on its own final line; rewrite that quote to match the new `commandProtocolPrimer` wording from subplan 4 while keeping the other three protocol lines. The `runAcpToolLoop` description at line 101 that says it extracts the last recognized granted-owner command line becomes the block rule. The extraction sentence at line 103 (`Extraction selects the reply's last re...`) becomes selection of the last closed `janissary` labelled block. Keep the 8-step cap, gate, refusal text, tool table, and side-selection material in that section accurate; change only what the block rule alters.
- In `product/specs/agent-command.md`, replace the line-85 statement that a final command line inside a Markdown fenced block is treated as an example with the new rule: the command comes from the last closed fenced block whose info string is exactly `janissary`; an unlabelled fence or a fence with another info string is still an example and is ignored, for both backtick and tilde fences; a bare final command line outside a labelled block is prose and ends the run. Keep the surrounding grant and refusal material at lines 81–84 unchanged.
- State the correction behaviour in the specs: zero or more than one command in the labelled block produces the shared correction sentence and does not consume the 8-step core budget; corrections are unlimited in this version, which is a recorded risk rather than a new cap.
- Keep spec wording precise and exact about observable behaviour, per `ai/guidelines/developer-documentation.md`: name the exact label and the exact correction sentence, and cover the edge cases (unclosed block, other info strings, multi-line arguments, trailing prose, doubled command) as first-class statements, not as asides.
- `src/acp/command-line.test.ts` remains unchanged; confirm rather than edit it.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this subplan reuses it |
| --- | --- | --- |
| `product/specs/acp.md:87` (Autonomous tool loop) | Documents the current last-command-line rule, protocol, and 8-step cap | Edit the three block-rule statements in place; keep the rest of the section. |
| `product/specs/agent-command.md:83`–`:85` | Documents how an agent requests a command and the fenced-example rule | Replace the fenced-example statement with the labelled-block rule; keep the grant and refusal material. |
| `src/remote/serve-acp-loop.ts:109` (`driveToolLoop` call) | Runs the same loop on the remote host | Confirm no new protocol, RPC, or frame is needed because the extraction change already lives in `driveToolLoop`. |

## Proposed changes

Describe each spec edit in prose with the old statement and the new statement it becomes; do not paste large spec bodies as code. List the manual verification steps as concrete actions and expected observations.

## Implementation steps

1. Update the three block-rule passages in `product/specs/acp.md`.
2. Update the fenced-example passage in `product/specs/agent-command.md`.
3. Run `$janissary/scripts/run.mjs check-diff`.
4. Do the manual end-to-end pass described below on both paths.

## Tests

No new automated tests originate here; the automated coverage lives in subplans 1–4. This subplan verifies that the existing suites are consistent with the updated specs and that `src/acp/command-line.test.ts` is untouched.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` after all earlier subplans have landed. Keep `npm run check` for the human end-of-work gate; do not run it here.

Manual, in a shell tab with a role that grants a tool:

- Have the model reply with prose, then a final labelled block whose info string is exactly `janissary` containing one command with a multi-line argument, then a trailing sentence. Confirm the command runs, the trailing prose stays in the displayed reply, and the block is not shown twice.
- Repeat with zero commands in the block and with two commands in the block; confirm the model is asked to correct itself with the shared correction sentence instead of the turn ending, and that the corrections do not advance the 8-step command budget.
- Repeat once through an `agent` task to confirm the same block rule applies on that path, including the ask-user behaviour for a `question ask` line.

## Out of scope

- Any source, test, primer, extractor, or loop change; all code work is complete in earlier subplans.
- Changing the label, the correction sentence, the 8-step cap, or the gate.
- New protocol messages, RPCs, or UI.
- Running `npm run check` or making a commit or pull request.
