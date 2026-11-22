# Qualify the open-feature PR body rules so plan-first summaries are not required to be self-contained

**Complexity: 2/10** — ~6 added lines in one task-instruction file, 5 requirements, 0 test scenarios (p=3.56).

## Goal

The open-feature task opens a pull request in two body modes: a default full body and a plan-first short summary. Its preamble and "The PR description" section still state thoroughness as an unconditional absolute, so a subagent running in plan-first summary mode can read a rule that contradicts the mode's own short-body instruction and author a full description before any code exists. The goal is to scope those two statements to the default full-body mode and to state plainly that a plan-first body is intentionally short, with its full form authored later. Only the agent instructions change; no application behavior is affected.

## Requirements

1. The preamble no longer states thorough description as an absolute for every pull request: "just open it with a thorough description so reviewers understand exactly what changed and why" is qualified so it applies to the default full-body mode only.
2. "It must be **thorough and self-contained** — a reviewer should understand the feature without reading the code" is qualified so it applies to the default full-body mode only.
3. A sentence states that in plan-first summary mode the body is intentionally a short plan summary whose full form is authored later by `ai/tasks/feature/update-pull-request.md`.
4. The "Two body modes" section, the short-summary template, the Step 5 mode branch and the Step 7 skip remain unchanged byte-for-byte.
5. No file other than `ai/tasks/workspace/open-feature-pull-request.md` is edited as part of the fix.

## Design decisions

- Keep the full-body requirements as the default and bind them only to the default mode; plan-first summary mode is already defined as the deliberate exception in the "Two body modes" section, so no new mode or branch is introduced.
- Add the plan-first explanatory sentence in "The PR description" section, directly beside the qualified "thorough and self-contained" statement, so the exception is visible where the absolute used to be; the preamble's qualified clause reads through to that section.
- Link to the existing `../feature/update-pull-request.md` relative path already used elsewhere in the file rather than naming a new contract or duplicating its rules.
- Change only the two contradictory statements. The mode table, the short-summary template, the Step 5 branch and the Step 7 skip already express the correct behavior and are left untouched.

## Assumptions

1. The preamble's unconditional thoroughness clause is at `ai/tasks/workspace/open-feature-pull-request.md:3` ("just open it with a thorough description so reviewers understand exactly what changed and why").
2. The unconditional "thorough and self-contained" sentence is at `ai/tasks/workspace/open-feature-pull-request.md:11` ("a reviewer should understand the feature without reading the code").
3. The default mode is explicitly named "Full body (default)" at `ai/tasks/workspace/open-feature-pull-request.md:17`.
4. The full description is already authored later by `ai/tasks/workspace/open-feature-pull-request.md:18` ("the full description is authored later by [`update-pull-request.md`](../feature/update-pull-request.md)").
5. Step 5's mode branch at `ai/tasks/workspace/open-feature-pull-request.md:163` and Step 7's skip at `ai/tasks/workspace/open-feature-pull-request.md:191` already implement the short-body exception correctly.
6. These task files record agent instructions and have no application tests; verification is by reading, per the plan template's manual-check form for changes that add no code.

## Existing functionality

1. The "Two body modes" section documenting the default and plan-first modes — `ai/tasks/workspace/open-feature-pull-request.md:13`.
2. The short plan-summary template with `### What`, `Plan:` and optional `Subplans:` — `ai/tasks/workspace/open-feature-pull-request.md:20`.
3. The Step 5 branch that skips the full body in plan-first mode — `ai/tasks/workspace/open-feature-pull-request.md:163`.
4. The Step 7 skip that avoids screenshot capture in plan-first mode — `ai/tasks/workspace/open-feature-pull-request.md:191`.
5. The later full-description authoring step in `ai/tasks/feature/update-pull-request.md`, already linked from the open-feature task at `ai/tasks/workspace/open-feature-pull-request.md:18`.

## Implementation steps

Edit `ai/tasks/workspace/open-feature-pull-request.md` only. In the preamble, rewrite the final sentence so the thorough-description clause is bound to the default full-body mode — for example by replacing "just open it with a thorough description so reviewers understand exactly what changed and why" with a clause that opens the pull request and, in the default full-body mode, writes a thorough description so reviewers understand exactly what changed and why. Leave the rest of the preamble intact.

Then, in "The PR description", scope the "It must be **thorough and self-contained** — a reviewer should understand the feature without reading the code" sentence to the default full-body mode, and immediately after it add one sentence saying that in plan-first summary mode the body is intentionally a short plan summary whose full form is authored later by [`update-pull-request.md`](../feature/update-pull-request.md). Keep the surrounding instruction to write the body to `./temp/pr-body.md` and pass it to the create-PR script.

Make no other edits. Do not touch the "Two body modes" section, the short-summary template, Step 5's mode branch or Step 7's skip. Use natural line breaks and preserve the existing paragraph structure.

## UI design

None. This change edits an AI task instruction file only; it adds or changes no user interface.

## Tests

No application tests are introduced. The file is agent instruction prose, and the plan template states that tests of documentation should not be introduced. Verification is the reading-based check below.

## Out of scope

Changing the two body modes, the short-summary template, the Step 5 branch or the Step 7 skip; editing any other task instruction, application source, test, configuration, spec, help page, user documentation, PR title or commit subject; and changing the PR description itself. The backlog entry removal and the plan lifecycle are task mechanics, not part of the fix.

## Verification

Run `$janissary/scripts/run.mjs check-diff` to confirm no lint, typecheck or test regression.

Then do a concrete reading-based check. Read the preamble and "The PR description" of `ai/tasks/workspace/open-feature-pull-request.md` and confirm both thoroughness statements are now bound to the default full-body mode and that a sentence names plan-first summary mode as intentionally short with its full form authored later by `update-pull-request.md`. Read the "Two body modes" section, the short-summary template, Step 5 and Step 7 and confirm each is unchanged. A surviving unconditional "thorough and self-contained" or "just open it with a thorough description" claim, a missing plan-first sentence, or a changed mode section shows the change was not made correctly.
