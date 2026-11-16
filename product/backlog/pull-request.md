<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Avoid quadratic work when deriving writes for a large patch.

Existing Issue: The change builder scans every resolved place for each content write, making change derivation quadratic in the number of paths. Severity: 6/10

Existing Risk: 6/10 - A valid patch with many short file sections can monopolize the synchronous server while the number of comparisons grows with the square of the file count.

Proposal Risk: 2/10 - Large patches still require work proportional to their size, but indexing removed locations avoids the repeated full scans in change derivation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "avoid quadratic work when deriving writes for a large patch". In src/file-patch/changes.ts build a set of removed place locations once and use it to filter writes while preserving their insertion order and existing link and delete semantics. Add coverage in src/file-patch/sections.test.ts or a focused test for multiple removed and retained content entries, including a write through a link followed by deletion of that link, and verify large collections do not require a full places scan per write. Run the diff-scoped checks.
