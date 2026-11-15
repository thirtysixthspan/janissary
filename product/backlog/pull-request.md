<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Verify the plan's malformed-pattern preflight tests actually prove that a contained secret is never read.

Existing Issue: The local and far-side tests named "reports a malformed regex before a contained secret is read" assert only the diagnostic text and, locally, that the separate read fallback was not used; neither test spies on grep's content-read path, so an implementation that opened the `.env` fixture before returning the diagnostic would still pass them, contrary to the plan's instruction that fixture contents alone do not prove no reads and that scoped defining-module spies must assert no content or workspace work. Severity: 4/10

Existing Risk: 4/10 - The integration tests can stay green while the preflight order that protects secret contents regresses, leaving only the prerequisite module's suite to notice a change made at the ACP entry points.

Proposal Risk: 2/10 - The added spy is scoped and restored, so the risk is a brittle mock of the read seam rather than any production behavior; the new assertion is one additional call check.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2005 "assert the malformed-pattern ACP tests perform no content reads". In `src/acp/run-prompt.test.ts`, the local case writes a `.env` fixture and checks the regex diagnostic; add a scoped spy on the grep discovery or scan seam used by `src/file-grep/grep.ts` before invoking `deps.runCommand`, then assert it was not called and restore it in `finally`. Use the same scoped spy around the far-side case in `src/remote/serve-acp-loop.test.ts`, where the fixture `.env` and the `grepWorkspaceCommand` call currently prove only the returned text. The spy can target the exported `discoverGrepCandidates` or `scanFiles` binding from the file-grep modules, which are the workspace and content entry points the diagnostic must precede; keep the existing `readFileInTab` and `readWorkspaceCommand` fallback assertions and do not change the fixtures' secret text or the production diagnostic order. Verify both tests still pass and that the spy records zero calls.
