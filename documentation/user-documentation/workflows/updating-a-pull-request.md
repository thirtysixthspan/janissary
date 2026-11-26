# Update a pull request

<img class="agent-float" src="/agents/ahmed-south.png" alt="" />

You can have an agent bring an open pull request's description, plan, specs, and help pages back in line with its code. Pick `update-pull-request` from the [task picker](/user-documentation/command-bar/tasks), then add the pull request after it:

```
execute ./ai/tasks/feature/update-pull-request.md 232
```

The target can be a number (`232`), `#232`, a full pull request URL, or the head branch name. With no target, the agent uses the pull request for the branch you have checked out. If that finds nothing, it uses the only open pull request, and it stops and lists the candidates when there are none or several. It also stops if the pull request isn't open or your working tree isn't clean.

This task suits the end of a pull request's life, after it has been [reviewed](/user-documentation/workflows/pull-request-review), [tested](/user-documentation/workflows/testing-a-pull-request), and revised a few times. The code on the branch is the truth. Where the text and the code disagree, the text changes.

## Merge blockers come first

The agent checks out the pull request's branch and makes sure it can merge before reading anything. A repair changes the code, and the description has to match the code that merges.

It checks for conflicts with `master` first. If there are any, it hands the pull request to a fresh agent running `resolve-conflicts`. Then it waits for the CI checks to finish. If one fails, a fresh agent running `fix-build` diagnoses and repairs it. Each one pushes to the pull request's own branch and leaves it open. The handoffs run one at a time, and the agent tells you when it hands work off and what came back.

It checks again after a repair, up to three times. If a conflict or a failing build still can't be cleared, the agent stops there. Its report names the blocker and marks the rest of the update as not run. When there are no conflicts and the checks pass, or no checks are configured, the agent goes straight to the description work with nothing handed off.

## What gets updated

Once the pull request can merge, the agent reads its whole diff. Then it corrects four things:

- The pull request description: wrong claims are fixed and missing behavior is added.
- The pull request's own plan, with the fix plans from earlier repairs folded in.
- Every product spec that describes behavior the pull request changes, plus a new spec for behavior that has none.
- The in-app help: rows for changed commands and key bindings are corrected, and rows are added for new ones.

The agent leaves the user documentation pages alone. Those belong to the documentation workflow.

## Plan-first pull requests

A pull request that starts from a plan opens with a short summary instead of a full description: a **What** section, a `Plan:` line naming the plan it came from, and, when the plan was split into subplans, a `Subplans:` line listing each subplan in order. It has no Behavior examples, Screenshots, or How to verify section yet. The agent writes those sections from the final code, its tests, and the specs, so the pull request ends with a complete **What**, **Behavior examples**, **Screenshots**, and **How to verify** body.

## The description

<img class="agent-float left" src="/agents/bilal-south-west.png" alt="" />

The description keeps the author's section headings and their order. Text that is already accurate stays as written. Behavior examples and verification steps that no longer match are rewritten from the code, its tests, and the specs. The agent doesn't start the app to produce them.

The agent anchors every verifiable statement. Each **Behavior examples** transcript, **Screenshots** claim, and **Do**/**Expect** line names the exact source line or test assertion that proves it. A statement with no anchor is deleted. When two statements carry the same fact, the one with the more specific anchor stays: a named test assertion outranks a named source line, which outranks general prose.

The **Screenshots** section is a single line giving the reason no screenshot could be captured, not an image. The agent never starts the app to take one, and a plan-first pull request skips screenshot work when it opens.

The description leaves out anything a reader can see in the change set, such as commit, file, or line counts and commit SHAs. A figure that is already there is removed rather than updated, because the change set shows the current numbers and a copy in the prose goes stale with the next push.

Only the **Additional test cases** section never changes. It belongs to the testing workflow, which dates it to the commit it tested. The agent can refresh the title too. A plan-first pull request opens with the plan commit's subject, and that subject usually stops describing the delivered work once implementation lands. When that happens, the agent writes a Conventional Commit subject for the work with `gh pr edit <number> --title "<Conventional Commit subject>"`. The title also becomes the commit subject when the pull request is squash-merged. An accurate title stays as it is.

The agent edits the description only after it has pushed the branch, so the description never describes work that isn't there.

## One plan per pull request

<img class="agent-float" src="/agents/dogan-south-east.png" alt="" />

A pull request that has been revised carries its own plan plus one fix plan for each repair made with `work-pull-request-issue`. The agent folds what those fix plans record into the pull request's own plan, rewrites the plan to describe what was built, and deletes the fix plans. A complex feature's subplan plans are folded in and deleted the same way. The plan keeps its name, title, sections, and complexity rating. It carries no revision markers, because git history keeps the original wording.

The pull request's own plan is the one its first commit adds. If that commit adds no plan, or more than one, the agent doesn't guess. It leaves every plan as it is and names what it found in its report.

## The review backlog

Updating a pull request ends its revision cycle. Any entry still in the pull request's backlog is removed, and the report names each one. The backlog file goes back to its empty form and is never deleted.

## When nothing needs changing

If the description, plan, specs, and help already match the code and the backlog is empty, the agent commits nothing, pushes nothing, and leaves the description alone. Its report shows every part as unchanged.

Otherwise it makes one commit and pushes it to the pull request's own branch. If the push is rejected because the branch moved, the agent rebases and tries again, up to three times. It never force-pushes.

## What the agent never does

Apart from the merge-blocker repairs it hands off, the agent changes no source, test, or configuration file and runs no tests, lint, or checks itself. It doesn't start the app. It never posts a comment, never records a finding, and never merges or closes the pull request. The pull request stays open for you to merge.

Code that looks unintended is described as it stands. The agent lists it in its report under `Divergences` so you can judge it yourself.
