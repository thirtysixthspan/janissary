<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's far-side grep test coverage by clearing the shared workspace-command mock between tests.

Existing Issue: The new far-side grep tests in `src/remote/serve-acp-loop.test.ts` assert that the hoisted `grepWorkspaceCommand` mock was never called, was called once, or was called exactly eight times, but the file never clears that mock between tests, so calls from the `startRemoteLoop workspace grep routing` cases leak into the ungranted and disabled/agent-off refusal cases and the `startRemoteLoop grep loop preservation` cases, and those assertions fail. Severity: 6/10

Existing Risk: 6/10 - The changed suite cannot pass, so CI or a reviewer cannot distinguish a real regression in grep refusal, eight-step capping, or cancellation suppression from stale mock calls.

Proposal Risk: 2/10 - The fix is confined to test isolation, and the only residual risk is an existing order dependency that the corrected suite will expose immediately.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2005 "clear the shared far-side grep mock between tests". In `src/remote/serve-acp-loop.test.ts`, add a `beforeEach` that calls `mocks.grepWorkspaceCommand.mockClear()` for the `startRemoteLoop workspace grep routing` and `startRemoteLoop grep loop preservation` suites, or add the same one-line clear to the file-level `beforeEach` beside the temporary-directory setup. Leave the `vi.mock('../file-grep/grep.js')` factory's actual implementation and the deliberate `mockImplementationOnce` rejection case unchanged, and keep the explicit clear in the far-workspace routing case if desired. This makes the ungranted and disabled/agent-off refusal assertions, the without-tools case, the eight-step cap, and both abort cases count only calls made by their own test. Verify by running the server project for `src/remote/serve-acp-loop.test.ts` through the implementation task and confirming every new grep case passes alongside the existing glob and agent-run cases; do not alter production code.


* Verify the plan's malformed-pattern preflight tests actually prove that a contained secret is never read.

Existing Issue: The local and far-side tests named "reports a malformed regex before a contained secret is read" assert only the diagnostic text and, locally, that the separate read fallback was not used; neither test spies on grep's content-read path, so an implementation that opened the `.env` fixture before returning the diagnostic would still pass them, contrary to the plan's instruction that fixture contents alone do not prove no reads and that scoped defining-module spies must assert no content or workspace work. Severity: 4/10

Existing Risk: 4/10 - The integration tests can stay green while the preflight order that protects secret contents regresses, leaving only the prerequisite module's suite to notice a change made at the ACP entry points.

Proposal Risk: 2/10 - The added spy is scoped and restored, so the risk is a brittle mock of the read seam rather than any production behavior; the new assertion is one additional call check.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2005 "assert the malformed-pattern ACP tests perform no content reads". In `src/acp/run-prompt.test.ts`, the local case writes a `.env` fixture and checks the regex diagnostic; add a scoped spy on the grep discovery or scan seam used by `src/file-grep/grep.ts` before invoking `deps.runCommand`, then assert it was not called and restore it in `finally`. Use the same scoped spy around the far-side case in `src/remote/serve-acp-loop.test.ts`, where the fixture `.env` and the `grepWorkspaceCommand` call currently prove only the returned text. The spy can target the exported `discoverGrepCandidates` or `scanFiles` binding from the file-grep modules, which are the workspace and content entry points the diagnostic must precede; keep the existing `readFileInTab` and `readWorkspaceCommand` fallback assertions and do not change the fixtures' secret text or the production diagnostic order. Verify both tests still pass and that the spy records zero calls.
