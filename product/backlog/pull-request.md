<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's fixed help-page layout in the pages that add free-standing prose.

Existing Issue: `help/browser.md` and `help/files.md` put explanatory paragraphs after Usage, `help/schedule.md` puts one after Use cases, and `help/ssh.md` adds a second unlabelled paragraph before Usage, so these command pages do not follow the required description, Usage, Use cases, Examples sequence. Severity: 3/10

Existing Risk: 3/10 - Different page structures weaken the predictable scan pattern, although the command guidance remains available.

Proposal Risk: 1/10 - Moving each note into the description or its relevant labelled block restores the same layout without losing information.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "restore the fixed layout on command help pages". Adjust `help/browser.md`, `help/files.md`, `help/schedule.md`, and `help/ssh.md` so each has one opening description followed by the Usage, Use cases, and Examples blocks in that order. Move the explanatory prose into the description or relevant labelled block without dropping factual details. Compare the four pages directly with the fixed format in `product/plans/complete/help-command.md`; the plan deliberately has no layout snapshot test, so verify the structure by inspection and leave runtime behavior unchanged.
