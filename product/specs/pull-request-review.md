# Pull request review

### Review and recording

A review assesses an open pull request across description fidelity, plan fidelity, functionality gaps, introduced technical debt, and introduced security issues. It records new findings in the review backlog on that pull request's branch and leaves the pull request open. Existing findings are preserved and duplicates are not recorded again. The review does not implement its findings.

### Follow-up work

Every new finding directs its implementation through the work-an-issue workflow. The proposal identifies the reviewed pull request and a concrete issue summary, followed by an implementation and verification plan. Follow-up work uses PR update mode so the fix is committed to the same open pull request without merging it.

The same route applies to all five review dimensions, including security. References to other tasks provide detection guidance only; they do not redirect implementation to another task or substitute a human-only handoff. Previously recorded entries are not rewritten by a later review solely to change their routing.
