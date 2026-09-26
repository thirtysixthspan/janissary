# Drop the Janissary worked example from the spec-testing task

**Complexity: 1/10** — one section removed from one task prompt, one dangling pointer repaired, one paragraph rewritten to stand alone, one test's pinned set reduced. No application code.

`ai/tasks/research/find-bugs.md` ends its build-and-start step with a `### Janissary worked example` section: five numbered steps spelling out how to build, seed, configure, launch, and hold a Janissary instance for testing. Removing it leaves three things pointing at nothing, all of which this change repairs rather than leaves to a reader:

- Step 3's discovery step ends with "For Janissary use the fixed recipe in Step 4", which would name a section that no longer exists.
- The paragraph that followed the example opened with "For another web app", a contrast that only meant something against the example it followed; it has to read on its own.
- Six of the literals `scripts/find-bugs-playbook.test.mjs` pins — the build script, `web/dist`, `sandboxWorkspaces`, `__JANUS_URL__`, the launcher's timeout message — lived only in that section, so the pins have nothing to hold and would fail.

What stays is the Janissary knowledge that is not the recipe: how to stop an instance (`node bin/janus.mjs stop <dir>`) appears in the leftover-directory and teardown steps, both outside the removed section, and the holder-process rule is already written down in `ai/guidelines/sandbox-e2e-browser.md`, which Step 1 sends every run to read.

## Approach

**Remove the section, keep the stop mechanics.** A run still has to be able to stop what it started, and both places that say how are outside the removed section.

**Let the project's own instructions supply the recipe.** Step 3 already reads `AGENTS.md`, the README, and the manifest's scripts in that order, and a Janissary checkout's `AGENTS.md` names `npm run build` and the script runner. Nothing needs to replace the section for the run to work on a checkout; what it loses is the four facts no project document states: which identity the scratch repository needs, that the nested sandbox has to be off, that the launcher detaches and prints a token-gated URL, and that the launcher prefers a compiled main over the TypeScript source.

**Reduce the pin to what the playbook still quotes.** A pin with nothing to hold is a test that fails for no reason, which is how a test earns its removal. The stop message, the two browser variables, the report shape, and the two runner spellings all survive, and each of those is still a contract between the playbook and something that can change.

**Say in the plan that the section went.** The plan's design decisions record that Janissary was to be the worked example; the plan is not rewritten, but its verification status gains a line saying the section was removed after the fact, so the next reader does not read the gap as an oversight.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — delete the `### Janissary worked example` heading and its five steps.
2. `ai/tasks/research/find-bugs.md` — Step 3's closing sentence, which pointed at the removed recipe.
3. `ai/tasks/research/find-bugs.md` — the paragraph that followed the example, rewritten to stand on its own and to keep pointing at the browser guideline for the holder rule.
4. `scripts/find-bugs-playbook.test.mjs` — the pinned literal table, reduced to the stop message, and the header comment rewritten to describe the surface that is left.
5. `product/plans/complete/find-bugs-task.md` — one line in the verification status recording the removal.

## Tests

`scripts/find-bugs-playbook.test.mjs` is the affected test. Its application-literal table keeps the stop message the teardown step matches; the six entries whose only occurrence was the removed section go, and the header comment stops claiming the pin covers the launcher, the server's bundle requirement, and the build. Everything else in the file is untouched: the two browser variables against the guideline, the ten report lines against the plan, both runner spellings, and the audit command's named lockfile.

No new test. What the removal loses is prose, and prose has nothing to assert on.

## Out of scope

- **`node bin/janus.mjs stop <dir>` in the leftover-directory and teardown steps.** Stopping what a run started is not the recipe, and both instructions sit outside the removed section.
- **Moving the recipe somewhere else** — into a guideline, or into a second task. Keeping the knowledge is a separate decision from removing it from this file, and this change does not make it.
- **Rewriting the plan's design decisions.** They record what was decided when the plan was written. The verification status is where what actually happened belongs.
- **The other research tasks.** None of them carries a worked example; this is the only playbook that named a specific project.
- **The `janus` collision in the start-failure list.** That is about a run racing another run, not about how to start one.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the task for `recipe`, `worked example`, `Step 4` and confirm each remaining mention resolves, and confirm no reference to the removed section is left anywhere in the repository.
