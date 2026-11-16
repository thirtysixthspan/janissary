# Correct the saved-tell verification expectation in the default-grants subplan

**Complexity: 1/10** — no production lines or files, one verification step rewritten and 2 requirements (p=2.35)

## Goal

The Verification section of `product/plans/complete/web-search-13-default-grants.md` must expect what a saved `tell` role without `web search` actually produces: no web tool at all, so no web step and no web primer, and a model-emitted `web search` line stays prose in the answer. It must not promise `Command not allowed for role "tell": web search.`, a refusal the code cannot reach while the grant is absent.

## Issue

Recorded on PR #2010's branch backlog, severity 3/10:

> Correct the subplan's saved-tell verification step, which expects a role refusal the code cannot produce.

Verification step 3 of the subplan says to restore a saved roles file without `web search` and then confirm no web step runs "(or, if the model emits one, it reads `Command not allowed for role "tell": web search.`)". A checker who sees prose behind that line is looking at the correct outcome.

Verified against the code:

- `src/acp/tool-table.ts` — `createAcpToolTable` filters `NATIVE_ACP_COMMANDS` by the passed grants and then keeps only the tool owners some allowed command still maps to, so a grants list without `web search` produces no `web` entry: no `WEB_SEARCH_PRIMER`, and no `web search` line in `toolPrimer`'s allow-list.
- `src/acp/tool-table.ts` — `gateCoreCommand` refuses an ungranted command only after `tools.find((candidate) => candidate.match(command))` returns a tool; with the web entry absent it throws `No ACP tool matched command` instead, and `toolExtractor` never offers the line for gating in the first place.
- `src/acp/drive-loop.ts` — `driveToolLoop` builds the table from `snapshot.grants` and builds `toolExtractor(tools)` from that same table, so a line the table does not recognize stays in the answer.
- `src/acp/run-prompt.ts` — `coreSnapshot` sets `grants: request.commands`, the role's grants, so the table and the snapshot are built from one source and cannot disagree about the grant.
- `src/acp/tool-table.test.ts` — `returns null for a trailing web search line on a table without the web entry` pins that a trailing `web search x` extracts as nothing when the web entry is absent; the gate's role refusal is pinned separately by a case whose table carries `web search` and whose snapshot does not, a combination a real role cannot produce.
- `product/specs/web-search.md` — its Agent tool section already states the rule: "A role that does not grant it receives no web tool, so a `web search` line stays prose."

## Approach

1. Rewrite only Verification step 3 of `product/plans/complete/web-search-13-default-grants.md`, keeping the instruction to move the saved roles file aside, restore it, restart, and repeat the `tell` prompt, and keeping the confirmation that no web step runs. Replace the parenthesized refusal expectation with what the check now proves: no web tool, no web primer, and a model-emitted `web search` line left as prose.
2. Leave every other section of that subplan byte-for-byte: Design decisions, What already exists, Proposed changes, Tests, the other two manual steps, and Out of scope.
3. Re-read the rewritten step against `createAcpToolTable`, `driveToolLoop`'s table construction, and `coreSnapshot`, and confirm both the tool table and the run snapshot read the role's grants.

## Design decisions

- **Correct the completed subplan in place.** Its Verification section is an instruction for the person checking this still-open pull request, not a record of what was planned; leaving the wrong expectation there sends every checker after a refusal that cannot fire. `product/plans/complete/web-search-token-row-forwarding-unconditional.md` corrected a completed plan's design decision in place for the same reason.
- **Change only the verification step.** The subplan's design decisions and proposed changes record what the slice intended, and other plans on this branch cite that record as history. A wrong expectation about runtime behavior has no such value: the code, not the plan, decides what a checker sees.
- **No duplicate test.** The extraction behavior is already pinned by `returns null for a trailing web search line on a table without the web entry`, and the grant-to-snapshot path by `coreSnapshot`'s `grants: request.commands`. A new case would restate the same two facts.
- **No production code or test change.** The saved-role behavior is deliberate and matches the spec; only the document describing what to expect is wrong.

## Proposed changes

One markdown file changes. In `product/plans/complete/web-search-13-default-grants.md`, Verification step 3 becomes:

```markdown
  3. Restore your own `~/.janissary/roles.json` (without `web search`), restart, and run `tell find the current Node.js LTS version on the web` again. Confirm no web step runs: the role's grants build the tool table and the run snapshot together, so a saved `tell` without the grant has no web tool, no web primer, and no `web search` in its allow-list. A model-emitted `web search` line therefore stays prose in the answer instead of producing `Command not allowed for role "tell": web search.`
```

Steps 1 and 2, the shell command bullet above them, and the rest of the file stay exactly as they are.

## Tests

No test changes. The behavior the corrected step describes is already pinned, and both existing cases must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`:

- `src/acp/tool-table.test.ts` — `returns null for a trailing web search line on a table without the web entry`.
- `src/acp/tool-table.test.ts` — `createAcpToolTable`'s cases that build the table from a grants list, and the gate cases beside them.

Verify the prose by reading it:

- The step keeps the instruction to restore the saved roles file and confirm no web step runs.
- It expects no web tool, no web primer, and no allow-list entry for a saved `tell` without the grant.
- It says a model-emitted `web search` line stays prose, and does not offer `Command not allowed for role "tell": web search.` as an alternative outcome.
- Every other line of the subplan is byte-for-byte unchanged.

## Verification

- `$janissary/scripts/run.mjs check-diff` (documentation-only diff).
- Re-read Verification step 3 beside `createAcpToolTable`, `driveToolLoop`, and `coreSnapshot`.
- Search `product/plans/complete/web-search-13-default-grants.md` for the refusal text and confirm the only mention of it is the one that says it does not happen.

## Spec

No `./product/specs/` update. `product/specs/web-search.md`'s Agent tool section already states that a role which does not grant `web search` receives no web tool and that a `web search` line stays prose, and `product/specs/acp.md` already describes the gate's refusal as applying to a command from an included tool owner. The fix changes no behavior.

## Out of scope

- `src/acp/tool-table.ts`, `src/acp/tool-table.test.ts`, and every other source or test file; the behavior and its pins are correct.
- The subplan's Design decisions, Proposed changes, Tests, and Out of scope sections.
- The same refusal alternative in `product/plans/complete/web-search-12-acp-tool.md`'s manual step 5; the recorded entry names only the default-grants subplan.
- Every other backlog entry on this branch.
- Rebasing, merging, or resolving the branch's conflict with `master`.

## Rating basis

lines_added=0, files_edited=0, requirements=2, scenarios=0, new_units=0. Production counts are zero because the only edited file is a completed plan. The two requirements are that a saved `tell` without the grant gets no web tool and no web step, and that a model-emitted `web search` line stays prose rather than returning a role refusal. p = 1.578 + 0.705·ln(3) = 2.35, under the 3.461 threshold for 1.
