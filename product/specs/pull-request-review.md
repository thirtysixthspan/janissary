# Pull request review

### Review and recording

A review assesses its stated scope across description fidelity, plan fidelity, functionality gaps, introduced technical debt, and introduced security issues. An ordinary review covers the full open pull request; a staged complex-feature review may be limited to one implementation commit and its subplan. It records new findings in the review backlog on that pull request's branch and leaves the pull request open. Existing findings are preserved and duplicates are not recorded again. The review does not implement its findings.

### The review backlog

The review backlog is one flat list of findings with no status grouping. Every entry in it is ready to work, and the order entries appear in is their priority: new findings are added to the end, and moving an entry up is how it is prioritised. An entry leaves the list when it is resolved or when someone decides against it, since deleting an entry is how a finding is declined. Once the last entry goes, the backlog returns to its empty form — the leading comment and heading it carries on master — rather than being removed from the branch.

### Follow-up work

Every new finding directs its implementation through the work-pull-request-issue workflow. The proposal gives the explicit reviewed PR number and a concrete issue summary as a backlog-entry selector, followed by an implementation and verification plan. Follow-up work repairs one recorded entry on that same open PR's head branch without merging it.

The same route applies to all five review dimensions, including security. References to other tasks provide detection guidance only; they do not redirect implementation to another task or substitute a human-only handoff. Previously recorded entries are not rewritten by a later review solely to change their routing.

### Review cycle after building a feature

Building a feature from a ready plan doesn't stop once its pull request is open. The full pull request is reviewed against the completed plan, and its findings are resolved one at a time in file order. Each review and each repair runs separately from the work that wrote the code. A finding isn't skipped for its complexity rating, because it's already recorded work for that pull request. After the backlog empties, the pull request is reviewed again. The cycle repeats until a review adds no findings and the backlog is empty. The pull request is then updated so its description, plan, specs, and help match the final code ([[pull-request-updating]]). It stays open throughout and is never merged by the workflow.

A subplan built as part of a complex feature skips all three of those closing stages: opening the pull request, the review cycle, and the update. The complex-feature workflow runs its own staged reviews and its own update for the whole feature.

### Staged reviews for complex features

When a complex feature is split into subplans, all initial subplans are published to one open pull request before implementation begins. Each subplan is improved and published immediately before its implementation. After each implementation commit is pushed, its review is limited to that commit against the corresponding subplan; the aggregate pull request is not reviewed during these cycles.

Findings from each focused review are added to the pull-request backlog and resolved one at a time in file order. The next subplan does not begin until its predecessor and all resulting repairs are published and the backlog is empty. Once every subplan has completed this cycle and the canonical plan and pull-request description match the finished feature, the aggregate pull request is reviewed. Its findings are also resolved one at a time before another full review. Full review and repair cycles continue until a review adds no findings and the backlog is empty. The pull request remains open throughout.
