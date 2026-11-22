# Correct the editor persona connection-row example

**Complexity: 1/10** — documentation-only correction: no production files, no code requirements, no new tests or units (p=1.578). The care is in matching the PR prose to the exact row and record shapes the code renders without changing any runtime behavior.

## Goal

Pull request 2170's description claims, in its "Behavior examples" block, that an editor persona's connection row is `acp:claude:claude-haiku-4-5 ... Idle` and that "the model is the research role's configured model, not the ask default." Steps 1 and 2 of "How to verify" repeat the claim by telling a verifier to look for the role's model id in that row. The code does not render it that way: the editor connections window shows `<persona> (acp)` as plain text, and the connections tab's tracked record is named `acp:<role>:<ownerName>`. Correct only these named paragraphs so the description matches what a verifier actually sees, leaving every other character — including the corrected monitor tool-loop "What" sentence and the Screenshots reason — untouched.

## Approach

This is a description-fidelity fix, not a code change. Read the named source files to pin the exact shapes, then apply two prose corrections to the PR body after the plan-and-backlog commit is pushed. Verify the row text against `connectionsFor` in `src/editor/acp-manager.ts`, its carry-through in `src/connection/catalog.ts`, its plain-text render in `web/src/shared/status-windows/StatusPanels.tsx`, and the test that pins it in `src/editor/acp-manager.test.ts`; verify the record name against `recordConnectionName` in `src/plugins/connections/shared.ts`. For the model check, point the verifier at the monitor connection-info line in `src/monitor/session.ts` or at the connection record, as the closing paragraph of the description already does for other server-side facts. Preserve the title and the "Additional test cases" section exactly; leave change-set statistics out of the corrected paragraphs.

## Implementation steps

1. Read `src/editor/acp-manager.ts`, `src/connection/catalog.ts`, `web/src/shared/status-windows/StatusPanels.tsx`, `src/plugins/connections/shared.ts`, `src/monitor/session.ts`, and `src/editor/acp-manager.test.ts` to confirm the exact row and record shapes. No source, test, spec, help, or user-doc edits: `src/editor/acp-manager.test.ts` already pins the row text.
2. Write and promote this plan, remove only the resolved first entry from `./product/backlog/pull-request.md`, and leave the second entry byte-for-byte unchanged.
3. After pushing the commit, read the current body with `gh pr view 2170 --json body`, apply only the two named corrections, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit 2170 --body-file ./temp/pr-body.md`. Leave the PR open.

## Tests

No new tests. Verify by reading the corrected prose against the named source files and by keeping `src/editor/acp-manager.test.ts` passing unchanged.

## Out of scope

- Any source, test, spec, help, or user-documentation change.
- Editing the PR title or the "Additional test cases" section.
- Editing the corrected monitor tool-loop "What" sentence or the Screenshots reason.
- Editing the second backlog entry.

## Verification

- `$janissary/scripts/run.mjs check-diff` stays green.
- `gh pr view 2170 --json body` shows only the "Behavior examples" row/comment and "How to verify" steps 1 and 2 changed; the title, "Additional test cases", the monitor tool-loop "What" sentence, and the Screenshots reason are unchanged.
- The PR remains `OPEN` on `feature/persona-role-acp-pipeline` with the pushed commit as its head.
