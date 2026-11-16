<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the specs' claim, added by this subplan, that an agent's web search always runs on the host running the ACP loop.

Existing Issue: The Agent tool paragraph in `product/specs/web-search.md` and the closing paragraph of the new Web search subsection in `product/specs/acp.md` say a granted search runs on the host running the ACP loop, while `searchWebInTab` in `src/web-search/tab-search.ts` sends a remote tab's search to that tab's remote host through `localReadRoot` in `src/file-read/tab-read.ts`, so a local-fallback ACP session on a remote tab searches on the remote machine rather than the machine running Janissary. Severity: 2/10

Existing Risk: 2/10 - Someone debugging a local-fallback session's failed search looks on the wrong host and at the wrong token set, and a later slice may implement the documented but wrong rule.

Proposal Risk: 1/10 - The corrected wording would match `tab-search` and the workspace-command paragraph already in `product/specs/acp.md`, leaving only the usual risk that a reader skims past the corner case.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "correct the specs' routing rule for an agent's web search". In `product/specs/web-search.md`, replace the sentence beginning "The search runs on the host running the ACP loop" with the rule `src/web-search/tab-search.ts` implements: a granted search goes through `searchWebInTab`, so a local tab searches on the machine running Janissary and a remote tab searches on that tab's remote host, including a local-fallback ACP session on a remote tab, which prints `Remote connection unavailable.` when no channel is ready, while a remote-hosted loop calls `webSearch` on the far side with that workspace's merged tokens. Reword the matching sentence at the end of the `product/specs/acp.md` Web search subsection to say the step follows the workspace routing described above and searches on the side that owns the tab, leaving the existing local-fallback paragraph as the detailed statement. The `routes a local fallback session on a remote tab through the tab search` case in `src/acp/run-prompt.test.ts` and the `searchWebInTab` and `localReadRoot` code are the verification references; this is a documentation correction with no runtime change.
