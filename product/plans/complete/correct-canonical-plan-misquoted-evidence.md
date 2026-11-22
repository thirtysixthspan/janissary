# Correct the canonical plan's misquoted evidence for the plan-PR task

**Complexity: 1/10** — ~2 added lines in 1 file, 2 requirements (p=3.29).

## Goal

Make the canonical plan's evidence for the standalone plan-PR task quote the cited file accurately, so a reader checking the claims finds the quoted text and can trust that the task really delivers a standalone peer with a short body. Two parenthetical quotes in the plan do not appear in `open-plan-pull-request.md` and have to match its actual wording.

## Requirements

1. Assumption 16's parenthetical quote must match text actually present in `ai/tasks/workspace/open-plan-pull-request.md` — its opening "Your job: take the plan-only changes in this repository ... and open a pull request against `master` on GitHub carrying a short summary of the plan" (recorded Proposal).
2. Existing functionality 10's quote must read the file's exact "The body is a short plan summary, not a full description" instead of "The PR body is a short plan summary, not a full description" (recorded Proposal).

## Design decisions

- Replace only the quoted snippets; the plan's underlying claims (standalone peer, no mode flag, short body) are accurate and stay unchanged. Tied to requirements 1 and 2.
- Use the exact wording of the cited file as each quote, as the plan's other assumption and functionality entries do. Tied to requirement 1.
- No code, tests, specs or help pages change: verification is by reading each snippet against the current task file. Tied to requirement 2.

## Assumptions

1. The plan-PR task's opening text is the source for Assumption 16 — `ai/tasks/workspace/open-plan-pull-request.md:3` (`Your job: take the plan-only changes in this repository ... and open a pull request against master on GitHub carrying a short summary of the plan`).
2. The short-body statement lives under "The PR body" and reads "The body is a short plan summary, not a full description" — `ai/tasks/workspace/open-plan-pull-request.md:11`.

## Existing functionality

1. The canonical plan's evidence-list format: a claim followed by a path and a quoted fragment — `product/plans/complete/pull-request-descriptions.md:67` (Assumption 16) and `:80` (Existing functionality 10).
2. The quoted source text in the task file — `ai/tasks/workspace/open-plan-pull-request.md:3` and `:11`.

## Implementation steps

Edit `product/plans/complete/pull-request-descriptions.md` only. In Assumption 16, replace the parenthetical quote "A plan-first pull request is opened by ... the dedicated plan task" with the task file's opening "Your job: take the plan-only changes in this repository ... and open a pull request against `master` on GitHub carrying a short summary of the plan". In Existing functionality 10, change "The PR body is a short plan summary, not a full description" to the exact "The body is a short plan summary, not a full description". Leave the surrounding claim text, and every other assumption and functionality entry, unchanged. The fix is already present in the working tree; this plan records it and verification confirms it.

## UI design

None. The change edits quoted evidence in a plan file and exposes no user interface.

## Tests

This plan changes no application behavior and introduces no application code, so there are no application tests to add and no tests of documentation are introduced. Verification is by reading, as set out below.

## Out of scope

The task file `open-plan-pull-request.md` itself, the other quotes and claims in the canonical plan, the other plans, task instructions, product specs, help pages, application source, tests and configuration are unchanged. The first pull-request backlog entry was worked and published separately.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck or test regression.

Then read `product/plans/complete/pull-request-descriptions.md:67` and `:80` against `ai/tasks/workspace/open-plan-pull-request.md:3` and `:11`: Assumption 16's parenthetical quote must be the task's opening "Your job: ..." sentence, and Existing functionality 10's quote must read "The body is a short plan summary, not a full description" exactly as the task file does. Confirm the surrounding claims and all other entries are unchanged. A quote that still cannot be found in the cited file shows the change was not made correctly.
