<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's help-content promise by documenting the section-failure reasons the patch runner can report beyond the page's closed list.

Existing Issue: The `Patching several files` section of `help/file.md` says a section failure's `<reason>` is one of an enumerated list ending with the ENOTDIR case, while the patch runner also reports other filesystem reasons, such as `Permission denied; check file and folder permissions, then try again` when reading a section's path fails, so the page's closed set is incomplete. Severity: 2/10

Existing Risk: 2/10 - A user whose patch fails on an unreadable or vanished file meets a reason the page says cannot occur, so a routine permission or race failure can read as a defect in the patch command.

Proposal Risk: 1/10 - The page becomes accurate about the category, but a reader could still take the named examples as exhaustive unless the catch-all sentence says any other filesystem failure also appears as the reason.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "document the patch runner's other section-failure reasons". In the `Patching several files` section of `help/file.md`, change the paragraph beginning "The `<reason>` in a section failure is one of" so it stops claiming a closed set: keep the patch-specific reasons and the ENOTDIR example, then add a sentence that any other filesystem failure also appears as the reason, naming `Permission denied; check file and folder permissions, then try again` and `The source or destination no longer exists; refresh the file navigator, then try again` as examples, mirroring the catch-all in the `Writing and editing` section of the same page. The reasons come from `fileOperationReason` in `src/file-navigator/file-operation-result.ts` and reach the line through `sectionFailureLine` in `src/file-patch/messages.ts`; do not change the runner or its messages. The help content is checked only for its heading and usage line in `src/commands.test.ts`, so after the edit re-read the rendered `help file` output and run the server tests under `src/file-patch/` and the `help file` assertions in `src/commands.test.ts`; the existing patch behavior tests must stay untouched.

