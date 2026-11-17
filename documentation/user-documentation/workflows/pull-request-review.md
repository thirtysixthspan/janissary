# Review a pull request

<img class="agent-float" src="/agents/ekrem-south.png" alt="" />

You can have an agent review an open pull request and write down every problem it finds, without changing the pull request itself. Pick `review-pull-request` from the [task picker](/user-documentation/command-bar/tasks), then add the pull request after it:

```
execute ./ai/tasks/feature/review-pull-request.md 232
```

The target can be a number (`232`), `#232`, a full pull request URL, or the head branch name. With no target, the agent uses the pull request for the branch you have checked out. If that finds nothing, it uses the only open pull request, and it stops and lists the candidates when there are none or several. It also stops if the pull request isn't open.

## What the review covers

The agent reads every line the pull request adds, changes, or removes, in every kind of file, and checks each file of a repeated pattern on its own. It also checks every promise the pull request makes: the goal, decisions, changes, tests, documentation edits, and verification steps in its plan, each fix plan a repair added, and each claim in the description. It judges all of that on five points:

- Does the description match what the code does?
- Does the code deliver the plan?
- What functionality is missing?
- What technical debt does the change add?
- What security issues does it add?

There is no limit on the number of findings, and a minor one is recorded with a low severity rather than dropped. A review that finds nothing says so and records nothing. Its report states how many changed files and promise items it covered.

When the description states a change-set statistic that is wrong, such as a commit, file, or line count or a commit SHA, the agent proposes removing the claim instead of correcting the number. A correct statistic isn't a finding on its own.

## Where the findings go

<img class="agent-float left" src="/agents/fariz-south-west.png" alt="" />

Findings go into `product/backlog/pull-request.md` on the pull request's own branch. The agent commits and pushes that one file and leaves the pull request open. It doesn't fix anything, edit the title or description, post comments on GitHub, or merge.

It doesn't build or test either. It runs no install, lint, typecheck, or test command, so a branch that doesn't compile can still review clean. Run the checks yourself if that matters to you.

The file is one flat list with no status headings. Every entry is ready to work, and the order is the priority. New findings go on the end. To move an entry up, move it up in the file. To decline a finding, delete its entry.

Existing entries are kept as they are, and a finding that matches one already in the file isn't recorded again. If every finding was already on file, the report says nothing new was found rather than calling the pull request clean.

## Fix a finding

Each entry's `Proposal` starts with the command that repairs it, so you can copy it as written:

```
execute ./ai/tasks/feature/work-pull-request-issue.md 232 "correct the description's claim about binary frames"
```

This route is the same for all five points, security included. The repair needs an explicit number, `#number`, or pull request URL. A branch name doesn't work, and the agent won't guess a pull request from context. The text after it picks an entry by its title, a paraphrase, or a position such as "the second one".

With no text after the number, the agent takes the first entry rated below 7/10. If you name an entry rated 7/10 or higher, it stops instead of picking another.
The repair works on that pull request's branch, writes a fix plan, updates the specs and any help or documentation the change affects, and removes the resolved entry. When the last entry goes, the file goes back to its empty form: the leading comment and the `# pull-request` heading. Then it commits and pushes to the same branch and leaves the pull request open.

## Reviews inside a feature build

<img class="agent-float" src="/agents/yusuf-south-east.png" alt="" />

Building a feature from a ready plan runs this loop for you. After the pull request opens, the whole pull request is reviewed against the finished plan. Each finding is repaired one at a time, in file order, and the pull request is reviewed again. It repeats until a review adds no findings and the backlog is empty. Then the pull request is updated to match the final code. There are three parts to this: how the feature is staged, the focused and resolution reviews for each part, and the testing and final checks. The pull request stays open and nothing merges it for you.

### How a complex feature is staged

A feature can start from a ready plan rated anywhere from 1–10. A plan rated 1–5 stays intact as the single work unit, with no split and no duplicate plan. A plan rated 6–10 is split once into ordered subplans, each initially rated 1–4. If a subplan comes back rated above 4, the split is blocked until it's divided again. The builder accepts a final subplan rating below 7; a rating of 7 or higher blocks implementation and leaves the plans as they are.

All the improved subplans are published to one open pull request before any implementation begins. The feature's original plan moves to the completed plans in that same first commit, so it becomes the pull request's own plan.

### Focused reviews and resolution reviews

Once a subplan's implementation is pushed, that commit gets a review against its subplan alone. The whole pull request isn't reviewed during these cycles. Every finding goes into the backlog and is repaired one at a time, in file order, before any other review runs.

A resolution review follows. It checks each repaired finding against what its entry proposed and looks for regressions the repairs introduced, without reviewing the subplan from scratch. Anything still unresolved, or broken by a repair, is recorded and repaired the same way, and another resolution review follows. The next subplan starts only when a resolution review adds no findings, its predecessor and all its repairs are published, and the backlog is empty.

When every subplan has finished that cycle and the feature's own plan and description match the finished code, the whole pull request gets a full review. Its findings are also repaired one at a time before another full review, and the cycles repeat until a review adds none. When a review's findings only call for changes to the description, those changes are made and the work moves on without another review, as long as the repairs changed nothing else and the description shows each correction.

### Testing and final checks

After the update and full review, the feature is tested in a real browser, the same way as [Test a pull request](/user-documentation/workflows/testing-a-pull-request). Every finding is repaired separately in backlog order before testing runs again, and a description repair needs another test pass too. The cycle ends only when a completed test pass adds no findings and the backlog is empty. An unavailable browser, an incomplete run, a blocked repair, or a failed publication stops completion.

The pull request is updated again so its description and the feature's own plan reflect the repairs. Any code repair that update finds goes through testing before another final update. See [Update a pull request](/user-documentation/workflows/updating-a-pull-request) for what an update changes.

Before the feature is done, the published branch is checked for conflicts with the main branch, local validation failures, and failing GitHub checks. Conflicts go through conflict resolution on the same pull request, and a failing local or CI check goes through build repair in pull request mode. Recovery is limited to three verification sequences. Each sequence needs successful local validation and the configured GitHub checks for that branch or its current merge commit; a missing, stale, skipped, cancelled, inaccessible, or unfinished check doesn't count as success. If failures or conflicts remain after three sequences, the pull request stays open with a blocked report. The workflow never merges, closes, or replaces it.
