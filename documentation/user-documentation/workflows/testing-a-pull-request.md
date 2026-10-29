# Test a pull request

<img class="agent-float" src="/agents/demir-south.png" alt="" />

You can have an agent run an open pull request in a real browser and follow the testing steps the pull request offers as proof that it works. Pick `test-pull-request` from the [task picker](/user-documentation/command-bar/tasks), then add the pull request after it:

```
execute ./ai/tasks/feature/test-pull-request.md 232
```

The target can be a number (`232`), `#232`, a full pull request URL, or the head branch name. With no target, the agent uses the pull request for the branch you have checked out. If that finds nothing, it uses the only open pull request, and it stops and lists the candidates when there are none or several. It also stops if the pull request isn't open.

## Before you start

The agent drives the app through the [E2E browser](/user-documentation/advanced-agents/harness#giving-a-harness-a-browser) of the harness tab it runs in. Every harness gets one by default. If you started yours with `--no-browser`, or cleared **E2E browser** in the **New harness** dialog, relaunch it with the browser on. Without it the agent stops before it checks anything out. It doesn't fall back to reading the steps instead of running them.

The working tree also has to be clean. The agent stops and tells you what it found if it isn't.

## What gets tested

<img class="agent-float left" src="/agents/hakim-south-west.png" alt="" />

The agent runs the steps the pull request itself offers: the **How to verify** section of its description, and the manual checks in the **Verification** section of any plan the pull request carries. A step that appears in both is run once. If the pull request has no testing steps at all, the agent writes some from the plan and the changes, runs them, and records that the description lacks steps.

After those, it writes up to five more steps of its own for the behavior the pull request changes. It looks for realistic uses the manual steps skip, empty states, error paths, cancelling, repeating an action, and unexpected input. A small change may get fewer than five. Anything the plan defers as out of scope isn't tested.

It adds those steps to the pull request description under **Additional test cases**, after **How to verify**, so you can repeat them by hand. The section names the commit it was written for, and a later run replaces it instead of adding a second one. Nothing else in the description changes.

## Which branch runs

The agent builds and starts the app from the pull request's branch, using fresh scratch state that never touches your own app. It installs only the packages where the branch differs from `master`, and only after a supply-chain audit of the branch's lockfile passes. No install script runs. A branch whose package list and lockfile disagree isn't installed at all. The agent reports it as untestable and records nothing.

The instructions for preparing, starting, and stopping the app come from the pull request's base branch, never from the branch under test. So a pull request that changes how its own app starts is still started the old way. If that start fails, it's reported like any other failure.

The branch's code still runs, though, inside your tab's sandbox. The audit keeps install-time code out. It doesn't make the branch trustworthy.

## Steps that aren't run

Testing steps come from the pull request, so the agent treats them as untrusted. It runs a step only if it exercises the app it started, through the app's screens, its own command line, or a shell command that stays inside the run's scratch folder. It skips three kinds and lists each one as not tested, with the reason:

- `unsafe`: the step would install something, reach a host other than `127.0.0.1`, touch files outside the project and scratch folder, read a credential, push, or edit a tracked file.
- `tooling`: the step runs the project's lint, typecheck, tests, or checks.
- `environment`: the step needs a credential, a remote host, an outside network, or a native window.

If the branch won't build or start after one retry, every step is reported as not tested and nothing is recorded.

## Failures and reruns

<img class="agent-float" src="/agents/selim-south-east.png" alt="" />

The agent runs every failing step a second time on a freshly started app. A step that fails both times is a failure. One that fails only once is reported as intermittent, with how often it failed. A step that quits the app on purpose, such as closing the last tab, runs alone on a fresh app after the rest. If an earlier step ends the session by accident, the steps it cut off are run again on a fresh app instead of counted as failures.

Each failure is traced to a likely cause. When the app does what the plan says and the step expects something else, the step is wrong, and the agent records a correction to the description instead.

## Where the failures go

Failures go into `product/backlog/pull-request.md` on the pull request's own branch, in the same list that a [pull request review](/user-documentation/workflows/pull-request-review) writes to. The agent commits and pushes that one file and leaves the pull request open. A run with nothing to record commits nothing.

Each entry holds the step's text, the exact inputs, what was expected and what happened, the likely cause, the likely fix, and what a regression test should check. That's enough to replicate the failure without the run that found it. Failures with one cause share an entry. A failure an existing entry already covers adds a dated note to it instead of a new entry. Steps that pass appear only in the agent's report, which lists every step with its source and result.

## Fix a failure

Each entry's `Proposal` starts with the command that repairs it, so you can copy it as written:

```
execute ./ai/tasks/feature/work-pull-request-issue.md 232 "correct the step that expects a toast after saving"
```

The repair works on that pull request's branch and leaves it open. It never goes through ordinary issue work on `master`. See [Fix a finding](/user-documentation/workflows/pull-request-review#fix-a-finding) for how it picks an entry.

## What the agent never does

Testing finds problems. It doesn't fix them. The agent never edits the pull request's title, never changes its description beyond **Additional test cases**, never posts a comment, and never runs the project's lint, typecheck, or tests. It never merges or closes the pull request.
