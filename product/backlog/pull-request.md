<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's primer-consistency promise by updating the ACP spec's file-tool primer description so it includes the blocks this change adds.

Existing Issue: The "File write and edit tools" paragraph in product/specs/acp.md still describes the file tool's primer as read, glob, grep, and mutation blocks only, while this change adds a patch block and five new-command blocks and the "When a role grants file read" paragraph enumerates them all, so two sections of one spec give contradictory accounts of observable primer output. Severity: 4/10

Existing Risk: 4/10 - An implementer or reviewer who reads only the mutation-tools paragraph builds or approves a primer that omits the patch and new-command blocks, so agents granted those commands receive no primer guidance for them.

Proposal Risk: 2/10 - Both sections then describe the same complete composition and no production code changes, leaving only the residual risk of a future wording mismatch, which the now-parallel paragraphs make easy to spot.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "update the ACP spec's file-tool primer composition description". In product/specs/acp.md, edit the "File write and edit tools" paragraph — the one that says the file tool is included when a role grants any of the eleven commands — so its primer-composition sentence matches the complete enumeration in the "When a role grants file read" paragraph and the "File patch tool" and "File stat, exists, head, and tail tools" sections: the read, glob, grep, mutation, and patch blocks, then the list, stat, exists, head, and tail blocks, each separated by a blank line. Keep the existing point that a role granting only a mutation gets no read text. Do not change production code or any primer text itself; this is a spec-only correction so the two descriptions of the same observable primer agree. No test covers spec prose, so re-read both paragraphs to confirm they enumerate the same blocks and leave the already-accurate "When a role grants file read" paragraph and the newer tool sections untouched.
