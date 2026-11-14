<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description so it states that the branch rebuilds `file read`'s shared real-target secret check, not only the `--limit` helper, as part of the change.

Existing Issue: The description names `positiveInteger` as the one piece `file read` and `file glob` now share, but never says that `checkRealTarget` in `src/file-read/policy.ts`, which `file read` and the hosted write tool rely on to refuse secret and outside paths, was rebuilt on a new exported `createRealTargetCheck` with the home-secret anchor resolution split out of `isUnderHomeSecret`. Severity: 3/10

Existing Risk: 3/10 - A reviewer judging the security boundary from the description has no reason to re-check the secret policy that `file read` and the write tool depend on, so a regression in that refactor would go unexamined.

Proposal Risk: 1/10 - The description and the diff agree once the sentence is added; if the wording overstated or understated the change, a reader comparing it with `src/file-read/policy.ts` would see the mismatch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "state in the description that checkRealTarget was rebuilt on the new createRealTargetCheck". This changes ONLY the pull request description. Read the body with `gh pr view 2001 --json body`; in the implementation paragraph, after the sentence saying `file read` and `file glob` share one `positiveInteger` helper, add one sentence saying that `src/file-read/policy.ts` gains `createRealTargetCheck(realRoot)`, which resolves the home-secret locations once and returns a check with `checkRealTarget`'s exact results and no I/O per call, that the walk builds one per search for its per-match and link-target secret checks, and that `checkRealTarget` is now built on it so `file read` and the write tool keep their behaviour, pinned by the new cases in `src/file-read/policy.test.ts`. Leave every other paragraph byte-for-byte unchanged and apply it with `gh pr edit 2001 --body-file` after the push. No code, test, spec, help, or plan file changes.
