<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan's SSH option order in the command help signature.

Existing Issue: `help/ssh.md` puts `[ssh options…]` after `<destination>` even though the same page says connection options precede the destination and its port and identity example uses that order. Severity: 4/10

Existing Risk: 5/10 - Readers following the signature may treat options such as `-p` as the remote command instead of connection options, leading to failed or unintended SSH sessions.

Proposal Risk: 2/10 - Matching the usage signature to SSH's argument order removes the ambiguity while the parser and execution remain unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct SSH help option ordering". In `help/ssh.md`, present SSH options before the destination and a trailing remote command after it, such as `ssh [ssh options…] <destination> [remote command…]`. Update the stale signature in `product/specs/ssh-tab.md` to match while preserving its pass-through description, and keep the `-p`/`-i` and remote-command examples consistent. Verify the forms against `src/ssh.ts` and `src/ssh.test.ts`, including options before the destination and trailing remote-command tokens; runtime behavior remains unchanged.


* Deliver the plan's fixed help-page layout in the pages that add free-standing prose.

Existing Issue: `help/browser.md` and `help/files.md` put explanatory paragraphs after Usage, `help/schedule.md` puts one after Use cases, and `help/ssh.md` adds a second unlabelled paragraph before Usage, so these command pages do not follow the required description, Usage, Use cases, Examples sequence. Severity: 3/10

Existing Risk: 3/10 - Different page structures weaken the predictable scan pattern, although the command guidance remains available.

Proposal Risk: 1/10 - Moving each note into the description or its relevant labelled block restores the same layout without losing information.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "restore the fixed layout on command help pages". Adjust `help/browser.md`, `help/files.md`, `help/schedule.md`, and `help/ssh.md` so each has one opening description followed by the Usage, Use cases, and Examples blocks in that order. Move the explanatory prose into the description or relevant labelled block without dropping factual details. Compare the four pages directly with the fixed format in `product/plans/complete/help-command.md`; the plan deliberately has no layout snapshot test, so verify the structure by inspection and leave runtime behavior unchanged.
