<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the ACP spec's claim that local-tab mutations run through the new far-side workspace runner

Existing Issue: The updated far-side routing paragraph in `product/specs/acp.md` states that granted `file write` and `file edit` run through `runWorkspaceCommandIn` on the local tab as well as the remote machine, but the local host in `src/acp/run-prompt.ts` routes mutations through `mutateFileInTab` and never calls that far-side runner. Severity: 4/10

Existing Risk: 4/10 - A maintainer reading the spec to understand local mutation routing will attribute the local path to the shared far-side runner and change or test the wrong module, leaving the local/far-side boundary this unit is meant to document misdescribed.

Proposal Risk: 2/10 - Rewording the paragraph to mirror the adjacent read, glob and grep sentences removes the false attribution without touching runtime code; the only residual risk is a wording slip a careful re-read catches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "correct the spec's claim that local-tab mutations run through the far-side runner". In the `browser …` far-side routing paragraph of `product/specs/acp.md`, rewrite the `file write`/`file edit` sentence so it distinguishes local from far-side entry exactly as the surrounding `file read`, `file glob` and `file grep` sentences do: a local tab mutation goes through `mutateFileInTab` in `src/acp/run-prompt.ts`, while a far-side mutation goes through `runWorkspaceCommandIn` in `src/acp/workspace-runner.ts` to the mutation service. Keep the claim that typed and agent mutations share one root, one path policy and one set of messages, and follow the already-correct mutation paragraph later in the same spec, which scopes `runWorkspaceCommandIn` to a remote-hosted loop. Make no runtime changes — `src/acp/run-prompt.ts`'s local `host.runWorkspace` and `src/acp/workspace-runner.ts` are correct as written. Verify by re-reading the paragraph so all five file commands consistently name local versus far-side entry; no test changes are needed for a documentation-only edit.
