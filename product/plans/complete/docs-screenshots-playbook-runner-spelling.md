# Pin the screenshots playbook's runner spelling to the one it actually uses

**Complexity: 1/10** — one stale assertion in one test, plus the negative pin that stops the same drift recurring and a spec sentence naming the unattended invocation. No source change, no behavior change.

## Goal

`npx vitest run --project server` passes again. `scripts/docs-screenshots/task-playbook.test.mjs` currently fails on `names a real script-runner target and a real npm script`, asserting that `ai/tasks/take-documentation-screenshots.md` contains `./scripts/run.mjs docs-screenshots` when the playbook says `$janissary/scripts/run.mjs docs-screenshots`.

## Approach

1. **The playbook is right and the test is stale.** `df9403e5` (#1055) moved every task prompt under `ai/` from `./scripts/run.mjs` to `$janissary/scripts/run.mjs`, because a task prompt is inserted as `execute $janissary/ai/tasks/<path>` and runs against whatever project the tab is open on — where a relative `./scripts/run.mjs` resolves into the project and finds no runner at all. That commit updated the prompts, the sandbox carve-in, and both agent allowlists, and missed this one assertion. `product/specs/task-picker.md` already specifies the `$janissary/scripts/run.mjs <script>` spelling, so the spec and the playbook agree with each other and only the test disagrees with both.

2. **Fix the assertion rather than the playbook.** Reverting the playbook to satisfy the test would reintroduce exactly the bug #1055 fixed, on the one task prompt that still had the old spelling pinned. The assertion moves to `$janissary/scripts/run.mjs docs-screenshots`, which is the literal an agent reading the playbook actually types.

3. **Pin the absence of the old spelling too.** The failure mode here is not that the playbook named a missing script — it is that the playbook and its test drifted about how the runner is spelled, and a positive-only assertion cannot catch the reverse drift (a prompt quietly reverting to `./scripts/run.mjs` would keep passing as long as the `$janissary` form appeared somewhere too). One negative assertion closes that, in the file whose whole stated purpose is pinning the literals an agent matches on.

4. **Leave the contributor-facing `./scripts/run.mjs` spellings alone.** `product/specs/docs-screenshots.md`, `documentation/developer-documentation/documentation.md`, and the script header comments describe running the command from inside a Janissary checkout, where the relative path is correct and is what `CLAUDE.md` itself prescribes. Only a task prompt — which executes against a foreign working directory — needs the `$janissary` form. Rewriting those would be a change to correct text.

## Implementation steps

1. `scripts/docs-screenshots/task-playbook.test.mjs`: in `names a real script-runner target and a real npm script`, assert the playbook contains `$janissary/scripts/run.mjs docs-screenshots`, and add an assertion that it does not contain `./scripts/run.mjs`. Note in a comment why the spelling is the `$janissary` one, so the next reader does not "fix" it back.

## Tests

The changed test is the test. Verified by running `scripts/docs-screenshots/task-playbook.test.mjs` (15 assertions, all passing) and then the full `server` project, which must report no failures.

## Out of scope

- Any change to `ai/tasks/take-documentation-screenshots.md`, which is correct as written.
- The `./scripts/run.mjs` spellings in specs, developer documentation, and script header comments, which describe invocation from inside a Janissary checkout.
- Auditing every other task prompt for runner spelling — `ai/` holds no remaining `./scripts/run.mjs`, and this was the only failing assertion.
