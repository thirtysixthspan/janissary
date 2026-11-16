<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the subplan promotion by repointing the thirteen stale inbound links that still point at the workspace-routes subplan's former ready-folder path, closing the technical-debt gap the rename left.

Existing Issue: The commit moves the workspace-routes subplan into the completed folder but leaves thirteen references to its former ready-folder path across eight plan files, including the dependency bullet in the next slice's plan, so every one of those links now lands on a missing file. Severity: 3/10

Existing Risk: 3/10 - An agent picking up the next subplan follows its dependency link to a missing file and cannot tell whether the workspace-routes work was moved, abandoned, or never written, costing a detour at the handoff to the slice that makes the routes reachable.

Proposal Risk: 1/10 - The links resolve again; the only residual hazard is a later reference added at the old path, which a repository-wide search for the subplan's basename would reveal.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "repoint the stale inbound links to the workspace-routes subplan". Replace every occurrence of `./product/plans/ready/web-search-11-workspace-routes.md` with `./product/plans/complete/web-search-11-workspace-routes.md` in product/plans/complete/web-search-1-command-grammar.md, product/plans/complete/web-search-3-provider-tokens.md, product/plans/complete/web-search-6-search-core.md, product/plans/complete/web-search-7-remote-operation.md, product/plans/complete/web-search-8-remote-port.md, product/plans/complete/web-search-10-typed-command.md, product/plans/ready/web-search-12-acp-tool.md, and product/plans/ready/web-search-13-default-grants.md, changing only the folder in each path and leaving the surrounding sentences, deferral wording, and every other link untouched, as the earlier repoint plans for this pull request did. Verify with a repository-wide search under product/ for the former ready-folder path returning no matches, confirm every web-search-11-workspace-routes reference resolves under product/plans/complete/ and that the promoted subplan exists at product/plans/complete/web-search-11-workspace-routes.md, then run `$janissary/scripts/run.mjs check-diff` for the documentation-only diff. No source, test, spec, help, or configuration file changes.
