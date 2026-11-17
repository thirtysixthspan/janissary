# Reconcile the merged native-command counts with web search

**Complexity: 1/10** — no production lines or files change, two requirements (keep both commands in the vocabulary in order and keep tell at sixteen with ask at ten), no new test scenarios and no new units (p=2.35).

## Goal

This branch's `file patch` work and master's `web search` work each add one native command, so a replay of one without the other leaves stale counts: fifteen native commands with tell at fifteen and ask at nine. The rebase merged both commands into `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts`, with `file patch` after `file edit` and `web search` last, and into the built-in `tell` grant in `src/plugins/roles/roles-file.ts` while the built-in `ask` grant keeps `web search`. The merged inventory is sixteen native commands, tell grants sixteen, and ask grants ten. Every help page, spec, user page, pinned test, and the pull request description must name that same inventory, so this plan records the verification that they do and repairs only a concrete gap.

## Approach

Treat the replayed merge as the change under review. Read each artifact the work item names and compare its count and grant list with the two source files, then run the pinned tests. Make no edits when an artifact already matches; fix only the exact line that does not. The ordering of `file patch` and `web search` is settled for this fix at `file patch` after `file edit` and `web search` last, matching the native-command test and the Commands section.

## Implementation steps

1. Confirm `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` holds sixteen entries in this order: the four database commands, the three browser commands, the two question commands, `file read`, `file glob`, `file grep`, `file write`, `file edit`, `file patch`, then `web search`.
2. Confirm the built-in `tell` role's `commands` in `src/plugins/roles/roles-file.ts` is exactly that sixteen-command list, and the built-in `ask` role's `commands` is the ten-command list that includes `web search` and excludes `file patch`.
3. Confirm `help/tell.md` says the default tell role has all sixteen native commands and names both the patch and web grants, and `help/roles.md` says tell can search the web and apply a multi-file patch while ask's list includes web search.
4. Confirm `product/specs/roles.md` gives ask ten, tell sixteen, and hides **Add command** at sixteen; `product/specs/acp.md` orders the tool owners browser, question, file, web, then database, gives the file owner six commands, and states ask ten and tell sixteen; and `product/specs/agent-command.md` keeps the web refusal and adds the `file patch` refusal in both the local and remote execution sentences.
5. Confirm `documentation/user-documentation/tab-types/roles.md` hides **Add command** at sixteen and names both grants, and `documentation/user-documentation/advanced-agents/acp-agent.md` names both grants, the typed `file patch` and `web search` commands, and both refusals.
6. Confirm `product/plans/complete/file-patch.md`'s Default grants decision says tell goes to sixteen beside `file write` and `file edit` while ask keeps its ten including `web search`, and its Documentation bullet says tell has sixteen native commands.
7. Confirm the pinned tests match: `src/acp/native-commands.test.ts` pins the exact sixteen-entry vocabulary, `src/acp/ask-role.test.ts` and `src/plugins/roles/roles-file.test.ts` pin tell at sixteen with both commands and ask at ten without `file patch`, `web/src/plugins/roles/RolesTab.test.tsx` pins the vocabulary length at sixteen, and `src/acp/tool-table.test.ts` keeps the web primer and appends the patch primer to the file primer in the full-grants case.
8. Read the pull request description and confirm its sixteen-native-commands claim and its How to verify step 8 both say sixteen and list `file patch` among them, with no fifteen- or nine-command claim left.
9. Make no file edits. A failed check is the only reason to change a file, and then only the exact gap that failed.

## Tests

No runtime behavior changes and no new tests to add: the merged vocabulary and grants are already pinned by the five named test files. Run `npx vitest run --project server src/acp/native-commands.test.ts src/acp/ask-role.test.ts src/plugins/roles/roles-file.test.ts src/acp/tool-table.test.ts`, run `npx vitest run --project client web/src/plugins/roles/RolesTab.test.tsx`, and run `$janissary/scripts/run.mjs check-diff` after the plan and backlog changes.

## Spec and documentation

No functional spec, `help/` page, or user documentation changes: `product/specs/roles.md`, `product/specs/acp.md`, `product/specs/agent-command.md`, `help/tell.md`, `help/roles.md`, and both user pages already describe the merged sixteen/ten inventory because the replayed rebase resolved them together. The plan records that verification rather than editing them again.

## Out of scope

- Reordering `file patch` and `web search`, which would not change either role's command count.
- Changing either built-in role's grants beyond keeping the merged sixteen and ten.
- Rewriting historical completed plans such as `product/plans/complete/web-search.md`, which correctly record the fifteen-command inventory as of that change.
- Editing any production code, spec, help page, or user page that already matches the merged inventory.
