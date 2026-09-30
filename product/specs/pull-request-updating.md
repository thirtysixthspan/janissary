# Pull request updating

### What an update changes

An update takes an open pull request and brings everything that describes it back in line with the code on its head branch: the pull request description, its plan, the product specs, and the in-app help. The code is the ground truth. Where the text and the code disagree, the text changes and the code never does, so an update changes no source, test, or configuration file and runs no test suite. It installs the branch's dependencies behind the supply-chain audit while preparing the workspace, and nothing else it does uses them. It is meant for the end of a pull request's life, after it has been reviewed, tested, and revised several times, and it leaves the pull request open.

The description is corrected and completed in the author's own structure. Claims the code no longer supports are fixed, behavior the code has that the description never mentions is added, and the list of changed files is rebuilt from the current diff. The section headings stay as the author wrote them, and text that is already accurate is left alone. Behavior examples and verification steps that no longer match are rewritten from the code, its tests, and the specs; the app is never started to produce them. The title is never changed, because it has to match the commit subject. The "Additional test cases" section is never changed either, because it belongs to [[pull-request-testing]] and names the commit it was written for. The description is edited only after the branch has been pushed, so it never describes work that is not on the branch.

Every spec that describes behavior the pull request changes is corrected, whether or not the pull request already edits it, and behavior with no spec at all gets a new one. In the in-app help, rows for changed commands and key bindings are corrected, and rows are added for new ones. The user documentation pages are left to the documentation workflow.

### One plan per pull request

A revised pull request carries several plans: its own, committed before any review fix existed, plus one fix plan for each repair made through the work-an-issue workflow. An update folds the work those fix plans record into the pull request's own plan, rewrites that plan so it describes what was actually built, and deletes the fix plans, so the pull request ends with one plan. The plan keeps its name, title, section structure, and original complexity rating, and carries no revision markers.

The pull request's own plan is the one its first commit adds. When the first commit adds no plan, or more than one, the update does not guess: every plan is left as it is, and the report names what it found.

### The review backlog

Updating a pull request ends its revision cycle. Any entry still in the [[pull-request-review]] backlog on the branch is removed, the backlog returns to its empty form, and the report names each entry removed. The backlog file itself is never deleted.

Code that looks unintended is still described as the code has it. The update records no finding for it; it lists it in its report for a person to judge.

### Nothing to update

When the description, plan, specs, and help already match the code and the backlog is empty, an update commits nothing, pushes nothing, and leaves the description untouched. Its report shows every part as unchanged.

### What an update never does

An update never changes code, runs the project's tests or checks, starts the app, edits the pull request's title or its "Additional test cases" section, posts to the pull request, records a finding, force-pushes, or merges or closes the pull request.
