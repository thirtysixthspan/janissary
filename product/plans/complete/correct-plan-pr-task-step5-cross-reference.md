# Correct the plan-PR task's Step 5 cross-reference to the short-summary section

**Complexity: 1/10** — ~1 added line in 1 file, 2 requirements (p=3.21).

## Goal

Make the dedicated plan-pull-request task's Step 5 point at the section that actually defines the short plan-summary template, so an agent following the step can find the `### What` / `Plan:` / optional `Subplans:` shape it is told to write. Today Step 5 quotes "The PR description", a heading that does not exist in that file, while the template lives under "The PR body".

## Requirements

1. "change the quoted section name in Step 5 from 'The PR description' to 'The PR body'" (recorded Proposal).
2. "Step 5 must name a heading that exists in that same file" (recorded Proposal verification).
3. "its list of carried fields (What, Plan, optional Subplans) must still match the template exactly" (recorded Proposal verification).

## Design decisions

- Fix the reference, not the template: the section under "The PR body" already carries the correct short-summary shape, so only the quoted name in Step 5 changes. Tied to requirement 1.
- Keep the correction local to `open-plan-pull-request.md`. The full-body task's own "## The PR description" heading is a different heading in a different file and stays untouched. Tied to requirement 3.
- No code, tests, specs or help pages change: this is a documentation cross-reference fix, so verification is by reading. Tied to requirement 2.

## Assumptions

1. The short-summary template is owned by the `## The PR body` section of `ai/tasks/workspace/open-plan-pull-request.md` — `ai/tasks/workspace/open-plan-pull-request.md:9` (`## The PR body`) and `:23` (`### What carries the plan's own ... `Plan:` names ... `Subplans:`, when present ...`).
2. Step 5 quotes a heading that does not exist in that file — `ai/tasks/workspace/open-plan-pull-request.md:96` (`Write the short plan summary described under "The PR description" to ./temp/pr-body.md`).

## Existing functionality

1. The short-summary body template (`### What`, `Plan:`, optional `Subplans:`) — `ai/tasks/workspace/open-plan-pull-request.md:13` (the fenced body shape).
2. Step 5's instruction to write that summary to `./temp/pr-body.md` — `ai/tasks/workspace/open-plan-pull-request.md:96`.

## Implementation steps

Edit `ai/tasks/workspace/open-plan-pull-request.md` Step 5 only: replace the quoted section name "The PR description" with "The PR body" in the sentence that tells the agent to write the short plan summary to `./temp/pr-body.md`. Leave the rest of the sentence — the carried `### What`, `Plan:` and optional `Subplans:` fields and the ban on Behavior examples, Screenshots and How to verify — byte-for-byte unchanged. Do not edit `open-feature-pull-request.md`, which keeps its own full-body "## The PR description" heading. The fix is already present in the working tree; this plan records it and verification confirms it.

## UI design

None. The change edits a task-instruction cross-reference and exposes no user interface.

## Tests

This plan changes no application behavior and introduces no application code, so there are no application tests to add and no tests of documentation are introduced. Verification is by reading, as set out below.

## Out of scope

The full-body task `open-feature-pull-request.md`, its "## The PR description" heading, the short-summary template itself, the other task instructions, the product specs, help pages, application source, tests and configuration are unchanged. The second pull-request backlog entry is worked separately.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck or test regression.

Then read `ai/tasks/workspace/open-plan-pull-request.md:96` together with `:9` and `:13`–`:23`: Step 5 must quote "The PR body", a heading that exists in the same file, and the fields it lists (`### What`, `Plan:`, optional `Subplans:`) must still match the template under that heading exactly. Confirm `open-feature-pull-request.md` still owns its separate "## The PR description" heading. A stale "The PR description" quote in Step 5, or a template whose fields no longer match, shows the change was not made correctly.
