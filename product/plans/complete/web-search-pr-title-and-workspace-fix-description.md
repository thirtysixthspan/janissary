# Describe the web search feature and the workspace cancellation fix

**Complexity: 1/10** — no production code, tests, or specs; one paragraph added to a pull request body and one backlog entry removed (p=1.58).

## Goal

The pull request still presents itself as a documentation split: its title says it decomposes the web search plan into fourteen subplans, and its body's What and How to verify sections describe only web search. The branch also carries a workspace provisioning fix — a cancelled clone now cleans up only its own partial clone, so it cannot remove a newer launch's clone or a pre-existing folder under the same name, and no partial target is left behind to block a later launch. A reviewer, release-notes reader, or future bisect therefore has no way to tell that the pull request ships a behavior change alongside the documentation.

This plan adds one paragraph to the body's What section naming the workspace cancellation fix and leaves every other paragraph alone. The title is corrected by the orchestrator after this run, to `feat(web-search): add a provider-backed web search command and ACP tool`; this task is forbidden from changing the title, so the correction is recorded here and applied outside the branch.

## Approach

Change no source, test, spec, help page, or user documentation. `product/specs/workspaced-agent.md` (Workspace lifecycle) and `src/workspace/index.ts` already state the delivered behavior precisely. Add one short paragraph at the end of the What section describing that behavior, then commit the plan and the backlog entry removal, push, and apply the revised body with `gh pr edit --body-file ./temp/pr-body.md`. Preserve every other paragraph byte-for-byte. Do not add workspace steps to the behavior examples or How to verify; the resolved entry asks only for the What paragraph.

The paragraph is checked against `src/workspace/index.ts`, where `provisioningPath` derives a unique `<target>.clone-<uuid>` sibling, `discardStaging` removes only that sibling on a cancelled or failed clone, and the finished clone is renamed onto the target only when the target is absent. The Workspace lifecycle section of `product/specs/workspaced-agent.md` restates the same promise: a cancelled attempt removes only the partial clone it made itself and never deletes a newer launch's clone or a folder that predates the attempt.

## Design decisions

1. **The entry's phrasing is tightened to match the code.** The entry says a cancelled clone "removes its partial target". The delivered code never writes a partial clone at the target: each attempt clones into a unique staging sibling and removes only that sibling, and the target appears complete or not at all. The paragraph says the cancelled attempt removes its own partial clone and leaves no partial target, which preserves the entry's point that a later launch under the same name is not blocked while staying true to the code.

2. **The title correction is recorded, not applied.** The working task forbids changing the pull request title, and the orchestrator applies the retitle after this run. The plan records the intended title so the two artifacts are edited together in intent and no later reader treats the old title as approved scope.

3. **Only the What section grows.** The entry names the What and How to verify sections as describing only web search, but its proposal says not to rewrite the behavior examples or verification steps. One paragraph under What is the whole description change; the examples and steps stay web search only.

4. **The body is applied after the push.** A description is live on GitHub while a file edit is not; applying it earlier would leave the pull request describing work not yet on its branch.

5. **No pointers in the published body.** The code and spec paths above are the verification trail for this plan. The body keeps reviewer-facing prose and does not gain internal file paths it did not already carry.

## Implementation steps

1. Verify the workspace behavior against `src/workspace/index.ts` (`provisioningPath`, `discardStaging`, the target-absent check before `renameSync`) and the Workspace lifecycle section of `product/specs/workspaced-agent.md`.
2. Draft the paragraph: the branch also carries a workspace provisioning fix; a cancelled clone removes only the partial clone it created itself; each attempt assembles its clone in a uniquely named temporary sibling and moves it into place only when it finishes; a cancelled or failed attempt leaves no partial target, so a later launch under the same name is not blocked, and it never deletes a newer launch's clone or a folder that occupied the name beforehand.
3. Move this plan from `draft/` to `ready/` once its wording is final, then remove the resolved entry from `product/backlog/pull-request.md`, leaving the remaining entries byte-for-byte unchanged.
4. Commit the plan and backlog change, push to `feature/web-search`, then read the live body with `gh pr view <reference> --json body`, insert the paragraph at the end of the What section, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`.
5. Confirm with `gh pr view <reference> --json title,body` that the paragraph is present, every existing web search claim survives, and no other paragraph changed. The title check records the orchestrator-applied retitle; it is not part of this branch's change.

## Tests

No automated tests. The change is prose in a pull request description plus the plan and backlog files, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the file changes; the command must exit 0.

Manual verification: diff the published body against the previous body and confirm the only change is the added paragraph; re-read the workspace lifecycle spec against `src/workspace/index.ts` to confirm the paragraph's claims.

## Spec and documentation

No spec, help, or user documentation change. `product/specs/workspaced-agent.md` already carries the corrected cancellation behavior, and `product/specs/web-search.md` already describes the delivered feature.

## Out of scope

- Changing the pull request title; the orchestrator applies `feat(web-search): add a provider-backed web search command and ACP tool` after this run.
- Rewriting the body's behavior examples, screenshots, setup, or verification steps.
- Changing source, tests, specs, help pages, or user documentation.
- Resolving the other entries in `product/backlog/pull-request.md`.
