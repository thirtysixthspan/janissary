<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Correct the subplan's saved-tell verification step, which expects a role refusal the code cannot produce.

Existing Issue: The Verification section of `product/plans/complete/web-search-13-default-grants.md` says that after restoring a saved tell role without `web search`, a model-emitted `web search` line may read `Command not allowed for role "tell": web search.`, while `src/acp/tool-table.ts` omits the web tool entirely when the role does not grant `web search` and `src/acp/tool-table.test.ts`'s `returns null for a trailing web search line on a table without the web entry` pins that the line stays prose. Severity: 3/10

Existing Risk: 3/10 - A person checking the slice sees prose instead of the expected refusal and may misdiagnose the deliberate non-migration as broken, or spend time looking for a gate that cannot fire.

Proposal Risk: 1/10 - The check matches the code after the change, but the saved-role behavior is unchanged and remains pinned by the existing tool-table case rather than a new end-to-end test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the saved-tell verification expectation in the web-search default-grants subplan". Rewrite Verification step 3 of `product/plans/complete/web-search-13-default-grants.md` so it expects no web tool and no web step for a saved tell role that does not grant `web search`, and says a model-emitted `web search` line remains prose rather than producing `Command not allowed for role "tell": web search.`; keep the instruction to restore the saved roles file and confirm no web step runs. If completed plans are maintained as history, put the same corrected check in the fix plan this work adds and cite the existing `src/acp/tool-table.test.ts` case `returns null for a trailing web search line on a table without the web entry` instead of adding a duplicate test; no production code changes. Re-read `src/acp/tool-table.ts`'s grant filter and `src/acp/run-prompt.ts`'s prompt snapshot to confirm the role's grants build both the tool table and the snapshot together.
