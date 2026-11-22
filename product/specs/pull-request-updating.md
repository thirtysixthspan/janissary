# Pull request updating

### What an update changes

An update takes an open pull request and brings everything that describes it back in line with the code on its head branch: the pull request description, its plan, the product specs, and the in-app help. The code is the ground truth. Where the text and the code disagree, the text changes and the code never does, so an update changes no source, test, or configuration file and runs no test suite of its own. The only code changes a run makes come from the merge-blocker repairs described below, which it hands to other workflows. It installs the branch's dependencies behind the supply-chain audit while preparing the workspace, and nothing else it does uses them. It is meant for the end of a pull request's life, after it has been reviewed, tested, and revised several times, and it leaves the pull request open.

A plan-first pull request is opened by the plan pull request task with a short summary instead of a full body: a **What** section carrying the plan's own title and goal, a **Plan:** line naming the source plan under the completed plans, and, when the plan was decomposed, a **Subplans:** line listing each subplan's path and title in order. It carries no Behavior examples, Screenshots, or How to verify section, and opens without screenshot work because there is no code or UI to capture yet. Ordinary pull requests opened from working code use the feature pull request task and keep the full four-section body.

The update is the single author of the full description. After the branch has been pushed, it writes all four sections — What, Behavior examples, Screenshots, and How to verify — from the final code, tests and specs, keeping the author's section headings and order and leaving accurate prose alone. This ownership is of whole sections, not exclusive editing: the work-item workflow keeps its surgical description-correction path, and the testing workflow keeps its own "Additional test cases" section. Every Behavior example transcript, Screenshots claim, and Do/Expect line must name the code path and line or test assertion that proves it; a verifiable statement with no anchor is deleted. Where two claims carry the same fact, the one with the most specific anchor survives — a named test assertion over a named code path and line, which outranks general prose — and the other is deleted. The Screenshots section carries the one-line reason no capture was possible rather than an image, since the update never starts the app. As a guideline, the description leaves out anything a reader can see in the pull request's change set, such as commit, file, or line counts and commit SHAs; a stated figure is removed rather than updated. The title is never changed, because it has to match the commit subject. The "Additional test cases" section is never changed either, because it belongs to [[pull-request-testing]] and names the commit it was written for. The description is edited only after the branch has been pushed, so it never describes work that is not on the branch.

Every spec that describes behavior the pull request changes is corrected, whether or not the pull request already edits it, and behavior with no spec at all gets a new one. In the in-app help, rows for changed commands and key bindings are corrected, and rows are added for new ones. Prose documentation is deliberately left out because it belongs to its own feature: user and developer documentation is owned by the documentation workflow, not by a feature pull request. An update reconciles only the canonical plan, specs, and in-app help with the final code.

### Merge blockers come first

Before it reads the code, an update makes sure the pull request can merge, because a repair changes the code the description has to match. It checks for conflicts with `master` first. A conflicting pull request, or one whose merge status stays unknown, is handed to the conflict-resolution workflow in a fresh agent. Then it waits for the pull request's CI checks to finish. A failing check is handed to the build-fixing workflow in a fresh agent. Each of those workflows keeps its own rules: it proves its own build, pushes to the pull request's own branch, and leaves the pull request open. They run one at a time, and the update announces each handoff and its result.

After any handoff the update checks again, since a rebase reruns CI and `master` can move during a repair. It makes at most three passes. A pull request with no conflicts and passing checks, or with no checks configured, goes straight on to the description work with nothing handed off.

When a conflict or a failing build can't be cleared, the update stops before describing anything. Its report names the blocker, marks the description, plan, specs, help, and backlog work as not run, and leaves the pull request open.

### One plan per pull request

A revised pull request carries several plans: its own, committed before any review fix existed, plus one fix plan for each repair made through the work-pull-request-issue workflow. An update folds the work those fix plans record into the pull request's own plan, rewrites that plan so it describes what was actually built, and deletes the fix plans, so the pull request ends with one plan. A complex feature's subplan plans are folded in and deleted the same way. The plan keeps its name, title, section structure, and original complexity rating, and carries no revision markers.

The pull request's own plan is the one its first commit adds. When the first commit adds no plan, or more than one, the update does not guess: every plan is left as it is, and the report names what it found.

### The review backlog

Updating a pull request ends its revision cycle. Any entry still in the [[pull-request-review]] backlog on the branch is removed, the backlog returns to its empty form, and the report names each entry removed. The backlog file itself is never deleted.

Code that looks unintended is still described as the code has it. The update records no finding for it; it lists it in its report for a person to judge.

### Nothing to update

When the description, plan, specs, and help already match the code and the backlog is empty, an update commits nothing, pushes nothing, and leaves the description untouched. Its report shows every part as unchanged.

### What an update never does

An update never changes code or runs the project's tests or checks itself, outside the merge-blocker repairs it hands off. It never starts the app, edits the pull request's title or its "Additional test cases" section, posts to the pull request, records a finding, force-pushes, or merges or closes the pull request.
