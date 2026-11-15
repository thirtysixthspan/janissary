<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan-fidelity gap in the typed grep help, which claims a named symlink `--path` always yields no matches.

Existing Issue: The typed grep help says a `--path` naming a single symbolic link answers `(no matches)` with no reason, while an outside-resolving link is refused as `Outside the workspace: <path>`, so the page states two different outcomes for the same input. Severity: 3/10

Existing Risk: 3/10 - A user who points `--path` at a link that leaves the workspace is told by the help to expect a silent no-match and may misread the containment refusal as a defect or as evidence that the link was searched.

Proposal Risk: 1/10 - The corrected wording leaves behavior unchanged and matches the resolver and existing tests; the residual risk is another help-page sentence repeating the unqualified claim.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2005 "correct the typed grep help's claim that a named symlink --path always yields no matches". In `help/file.md`, in the Searching contents section, change the bad `--path` sentence so a named file that is a symbolic link is described as `(no matches)` only when it resolves inside the workspace, and state that a link whose real target is outside the root is refused as `Outside the workspace: <path>.`; keep the existing `Path not found` and real-location-outside rules. Leave `product/specs/acp.md` unchanged: its File grep section already attributes a path resolving through an outside link to the containment refusal and limits the no-match answer to a named path the file set actually skips. Do not change production code: `src/file-grep/path-target.ts` already checks the real target before the final-link skip, and `src/file-grep/path-target.test.ts` and `src/file-grep/grep.test.ts` already cover an outside final link. Verify the edited wording against `resolveGrepTarget` and those tests, then run the diff-scoped checks; no behavior change is expected.
