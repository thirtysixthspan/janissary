# Update a pull request

<img class="agent-float" src="/agents/ahmed-south.png" alt="" />

You can have an agent bring an open pull request's description, plan, specs, and help pages back in line with its code. Pick `update-pull-request` from the [task picker](/user-documentation/command-bar/tasks), then add the pull request after it:

```
execute ./ai/tasks/feature/update-pull-request.md 232
```

The target can be a number (`232`), `#232`, a full pull request URL, or the head branch name. With no target, the agent uses the pull request for the branch you have checked out. If that finds nothing, it uses the only open pull request, and it stops and lists the candidates when there are none or several. It also stops if the pull request isn't open or your working tree isn't clean.

This task suits the end of a pull request's life, after it has been [reviewed](/user-documentation/workflows/pull-request-review), [tested](/user-documentation/workflows/testing-a-pull-request), and revised a few times. The code on the branch is the truth. Where the text and the code disagree, the text changes.

## What gets updated

The agent checks out the pull request's branch and reads its whole diff. Then it corrects four things:

- The pull request description: wrong claims are fixed, missing behavior is added, and the list of changed files is rebuilt from the current diff.
- The pull request's own plan, with the fix plans from earlier repairs folded in.
- Every product spec that describes behavior the pull request changes, plus a new spec for behavior that has none.
- The in-app help: rows for changed commands and key bindings are corrected, and rows are added for new ones.

The agent leaves the user documentation pages alone. Those belong to the documentation workflow.

## The description

<img class="agent-float left" src="/agents/bilal-south-west.png" alt="" />

The description keeps the author's section headings and their order. Text that is already accurate stays as written. Behavior examples and verification steps that no longer match are rewritten from the code, its tests, and the specs. The agent doesn't start the app to produce them.

Two parts never change. The title has to match the commit subject, so the agent leaves it alone. The **Additional test cases** section belongs to the testing workflow, which dates it to the commit it tested.

The agent edits the description only after it has pushed the branch, so the description never describes work that isn't there.

## One plan per pull request

<img class="agent-float" src="/agents/dogan-south-east.png" alt="" />

A pull request that has been revised carries its own plan plus one fix plan for each repair made with `work-pull-request-issue`. The agent folds what those fix plans record into the pull request's own plan, rewrites the plan to describe what was built, and deletes the fix plans. The plan keeps its name, title, sections, and complexity rating. It carries no revision markers, because git history keeps the original wording.

The pull request's own plan is the one its first commit adds. If that commit adds no plan, or more than one, the agent doesn't guess. It leaves every plan as it is and names what it found in its report.

## The review backlog

Updating a pull request ends its revision cycle. Any entry still in the pull request's backlog is removed, and the report names each one. The backlog file goes back to its empty form and is never deleted.

## When nothing needs changing

If the description, plan, specs, and help already match the code and the backlog is empty, the agent commits nothing, pushes nothing, and leaves the description alone. Its report shows every part as unchanged.

Otherwise it makes one commit and pushes it to the pull request's own branch. If the push is rejected because the branch moved, the agent rebases and tries again, up to three times. It never force-pushes.

## What the agent never does

The agent changes no source, test, or configuration file. It runs no tests, lint, or checks, and it doesn't start the app. It never posts a comment, never records a finding, and never merges or closes the pull request. The pull request stays open for you to merge.

Code that looks unintended is described as it stands. The agent lists it in its report under `Divergences` so you can judge it yourself.
