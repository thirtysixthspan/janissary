<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Clarify the ACP spec's description of the ask-only generic reset routes.

Existing Issue: The ACP spec now lists `tell reset`, the connection tab's **Close session**, and `connections close acp:<name>` together as reset routes, although the latter two still close only the ask role and the subplan explicitly defers role-aware connection routing. Severity: 3/10

Existing Risk: 3/10 - A tell user may rely on a generic close action to end the tell session, leaving that session open and able to produce later replies.

Proposal Risk: 1/10 - The specification will distinguish the tell-specific reset from generic ask-role close actions, while role-aware connection routing remains deferred.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1943 "clarify tell reset versus ask-only ACP close routes in the ACP spec". This is a description-only correction. Update the reset summary in `product/specs/acp.md` to state that `tell reset` closes the tell-role session while the connection tab's **Close session** and `connections close acp:<name>` continue to close only the ask-role session until role-aware connection routing is delivered. Keep runtime behavior unchanged because `product/plans/complete/tell-command-and-reset.md` explicitly defers role-prefixed connection identifiers and record-tab close routing. Check the wording against `src/plugins/connections-topic-actions.ts` and `src/connection/close.ts`; preserve the existing ask-reset and tell-reset behavior covered by `src/commands/ask-reset.test.ts` and `src/commands/tell-reset.test.ts`.
