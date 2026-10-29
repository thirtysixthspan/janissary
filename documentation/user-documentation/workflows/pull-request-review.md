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

Building a feature from a ready plan runs this loop for you. After the pull request opens, the whole pull request is reviewed against the finished plan. Each finding is repaired one at a time, in file order, and the pull request is reviewed again. It repeats until a review adds no findings and the backlog is empty. Then the pull request is updated to match the final code.
When a large feature is split into subplans, each subplan's commit gets its own focused review first. The whole pull request is reviewed only after every subplan is done. In both cases the pull request stays open and nothing merges it for you.
