<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's collapse fallback when a command changes the cursor on an already-open tree.

Existing Issue: When an existing tree has an anchor hidden by collapse and the same command sets a new cursor, `useFileNavigatorSelection` reconciles rows before applying the restore hint, so the anchor falls back to the old cursor instead of the command's cursor. Severity: 5/10

Existing Risk: 5/10 - The visible cursor and range anchor diverge, so a later Shift selection extends from an unintended row.

Proposal Risk: 2/10 - Coordinating partial-restore reconciliation could alter profile behavior if full replacements are not kept distinct.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "make collapse fallback use the command cursor". In `web/src/file-navigator/useFileNavigatorSelection.ts`, coordinate row reconciliation with partial restore application so when the command changes the cursor and collapses a folder in one revision, a hidden current anchor resets to the post-command cursor; preserve a still-visible current anchor and preserve profile restores' full-replacement behavior. Add a regression in `web/src/file-navigator/FileNavigatorTab.test.tsx` that seeds cursor, anchor, and selection under a folder, applies a cursor-only restore while the folder collapses, and asserts the new cursor is also the anchor while hidden selections disappear. Keep the existing once-per-revision and profile-restore cases passing.


* Clarify the technical debt in the shared restore hint's profile-only comments.

Existing Issue: `FileNavigatorView.restore` is documented as profile-only and absent on trees not launched from a profile, but `applyViewSteps` now writes it for command restores too. Severity: 2/10

Existing Risk: 3/10 - A later caller may infer the wrong lifetime and presence semantics and clear parts that command restores leave untouched.

Proposal Risk: 1/10 - Accurate comments leave the optional per-part semantics visible, though each caller still has to honor them.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "clarify shared file navigator restore comments". Update the restore-field comment in `src/tab/types.ts` to cover both profile and command restores and remove the claim that the field is absent for every tree not launched from a profile. Update the request-purpose comments in `src/file-navigator/selection-request.ts` and `src/bus.ts` to name both `profile save` and `files print` as consumers. Keep the change comment-only and verify the paths and uses agree.


* Reduce the security risk from executable verification instructions in the PR description.

Existing Issue: The PR description's setup and verification section directs reviewers to run `npm run build`, create filesystem fixtures, and execute app commands from the checkout. Severity: 5/10

Existing Risk: 5/10 - Following those steps executes code and filesystem operations from a branch the reviewer has not yet trusted, exposing the review environment if the checkout is malicious.

Proposal Risk: 2/10 - A non-executable verification summary no longer prompts reviewers to run untrusted checkout commands, although a deliberate later build still carries the usual source-trust risk.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "remove executable review instructions from the PR description". Replace the setup and verification block in the PR body with a concise, non-executable account of the scenarios and expected outcomes, removing commands such as `npm run build`, `mkdir`, `touch`, and the app command lines. Keep fixture names and behavior expectations as plain descriptions, and verify the resulting body no longer instructs a reviewer to execute commands from the checkout.
