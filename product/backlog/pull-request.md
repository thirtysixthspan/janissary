<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the stale `failed` reason comment on the ACP loop handler type

Existing Issue: The `finished` handler's comment in `src/acp/types.ts` still says `failed` is the outcome when a command throws or rejects, but the loop now turns those into ordinary follow-up results and never emits `failed`. Severity: 2/10

Existing Risk: 2/10 - A reader extending a consumer or writing a test trusts the comment and handles a terminal reason the loop no longer produces, or assumes a command error still ends the run.

Proposal Risk: 1/10 - This is a comment-only edit with no behavior change, and `product/specs/acp.md` already states the accurate contract in its tool-loop paragraph.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2137 "correct the stale failed reason comment on the ACP loop handler type". Rewrite the trailing comment on `AcpLoopHandlers.finished` in `src/acp/types.ts` to say the loop emits `answered` or `capped` and that `failed` remains in the union only for other producers, matching the wording already used in `product/specs/acp.md`. Make no code change. Verify by reading the comment against `runAcpToolLoop` in `src/acp/loop.ts`, which no longer calls the finish path with `failed`, and against the spec paragraph; the existing tests in `src/acp/loop.test.ts` and `src/acp/drive-loop.test.ts` already assert that command errors become ordinary results and must keep passing.
