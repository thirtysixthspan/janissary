<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's user-documentation update by naming the default patch grant in the ACP agent page's second description of tell's commands.

Existing Issue: The ACP agent page describes tell's default grants twice, and the second description, under "Let the agent look things up", still lists only database create/delete, browser eval, and writing and editing workspace files, omitting the `file patch` grant this change adds while the page's earlier description of the same defaults includes it. Severity: 2/10

Existing Risk: 2/10 - A reader who trusts the second summary believes tell cannot apply a multi-file patch by default and may add the grant manually or route the task elsewhere, so the same page teaches two different defaults.

Proposal Risk: 1/10 - The change is one sentence in a documentation page and cannot affect behavior; the only residual risk is wording that drifts from the page's other summary, which the proposal avoids by reusing its phrasing.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "add the file patch default to the second tell grant sentence in the ACP agent user documentation". In `documentation/user-documentation/advanced-agents/acp-agent.md`, in the "Let the agent look things up" section, update the sentence "Tell has those commands plus database create/delete, browser eval, and writing and editing workspace files." to say that tell also applies a patch that changes several files at once, reusing the wording already added to the page's earlier tell-defaults sentence under "Which model it runs" so both descriptions name the fifteen default grants consistently. Leave the surrounding ask description, the role-grant refusal sentence, and the later grant-removal explanation unchanged; the page carries no command count to adjust. The other help and user-documentation pages updated by this commit already include the patch grant, so no other prose needs a matching edit, and the page has no test covering its prose. Verify by reading both tell-default sentences in this page and confirming neither omits the patch grant, and confirm the page still names writing and editing separately from patching.
