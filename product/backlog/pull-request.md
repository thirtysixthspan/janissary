<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's single runscript path definition by routing clone creation through the shared helper, which the create-path repair recorded as unnecessary.

Existing Issue: The create-path repair's recorded plan says clone and untitled creation have no duplicated `.rs` rule, but cloneRunscript still builds its candidate from the bare name plus the suffix before calling nextFreeName, so the rule remains spelled in two places in the file the repair was meant to centralize. Severity: 3/10

Existing Risk: 3/10 - A later change to the runscript naming rule made only in the shared helper would leave a cloned runscript written under a path that the reader and the open flag never resolve.

Proposal Risk: 1/10 - After the change the clone path cannot diverge from the helper, and the remaining slice(0, -3) name derivations only matter if the suffix itself changes, which a reader meets in the same file.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "route cloneRunscript through runscriptFilePath". In src/schedule/system/runscript-files.ts, cloneRunscript builds its candidate as nextFreeName(directory, `${name}.rs`) and then file as path.join(directory, target). Change the candidate argument to the basename of the shared helper's result, so the line reads nextFreeName(directory, path.basename(runscriptFilePath(projectRoot, name))), and leave the directory variable, the path.join, the createExclusive refusal, and the target.slice(0, -3) return unchanged. Leave newUntitledRunscript as it is, because its 'untitled.rs' seed is a name that already reaches the path through createRunscript. Verify by a plain read that cloneRunscript no longer spells the .rs suffix in a template literal. The existing cloneRunscript cases in src/schedule/system/runscript-files.test.ts, which pin the next-free-name sequence (deploy-2, deploy-3), the missing-source case, and the symlinked-source refusal, must keep passing untouched, and no expectation is added or edited. Then correct the sentences in product/plans/complete/runscript-create-single-path.md that exclude cloneRunscript and claim the only other path join with a .rs suffix sits inside runscriptFilePath, so the recorded plan matches the code.
