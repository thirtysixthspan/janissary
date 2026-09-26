# Extract the application launch into a workspace task

**Complexity: 3/10** — one new task file, one task prompt losing two steps' worth of prose to it, and the spec, plan, and pin test following. Prose only, and the pin test is what keeps the extraction honest.

`ai/tasks/research/find-bugs.md` discovers how the project builds and runs, insists the app can be bound to loopback, creates a scratch home and a scratch working directory, redirects the app's state into them, builds, launches, waits for readiness, and later stops what it started and removes the scratch tree. That is a general operation with nothing specific to bug-finding in it: any unattended task that needs the project's app up on this machine needs the same eleven paragraphs. It also duplicates what the launch step has to guarantee. The workspace directory already holds tasks of exactly this kind — `prepare-workspace.md`, `quick-commit.md`, `resolve-conflicts.md` — so the launch belongs beside them as `launch-application.md`, and the research task calls it the way it now calls the preparation task: the project's own copy when it has one, the installation's otherwise.

## Approach

**The new task owns the app's whole life, and hands back a contract.** It starts the app and never drives it. What it reports is what a caller needs in order to drive it: the command it started, the address it is reachable on, the scratch paths, the process identity, and the stop command. Teardown is the other half of that ownership, so stopping what it started and removing its scratch state are its steps too, and a caller that has to ask twice where a process is would get the wrong answer.

**The scratch root is the caller's choice, and the caller owns the `.gitignore` line.** A caller names the directory — `./temp/find-bugs/` for the research task — and the launch task creates it, ignores it if the project does not already, and removes it at teardown. It is the only task in this pair allowed to edit `.gitignore`, and only to append the one `temp/` line.

**The project supplies the recipe, including how to stop.** Discovery reads the project's own instructions in the order the preparation task's caller already reads them, and it establishes the stop command *before* starting anything. Nothing in the new task names a specific product: the research task's Janissary specifics go with the extraction, which is consistent with the worked example's removal.

**No browser, ever.** The new task starts processes and reports addresses. Anything that drives the app — a page, a keystroke, an HTTP request — belongs to the caller, and launching a browser or closing the attached one stays forbidden in both files.

## Implementation steps

1. `ai/tasks/workspace/launch-application.md` — new: the job statement, the delegation rule for choosing the project's copy, allowed and forbidden lists, discovery, the loopback requirement, scratch creation, build and launch, the report, and teardown.
2. `ai/tasks/research/find-bugs.md` — Steps 3 and 4 reduced to calling the launch task with its scratch root, then connecting through the attached browser; the forbidden and allowed lists; the teardown step.
3. `product/specs/task-picker.md` — the discovery and launch sentences, replaced by the delegation.
4. `product/plans/complete/find-bugs-task.md` — a paragraph in the verification status recording the extraction, beside the two already there.
5. `scripts/find-bugs-playbook.test.mjs` — the link-integrity pin extended to the new task, and the loopback literal re-pointed at it.

## Tests

`scripts/find-bugs-playbook.test.mjs` is the affected test, and it is the reason this extraction is safe to make:

- a link-integrity assertion that the research task names both workspace tasks it calls and that both files exist, which is the failure mode a prose extraction actually has: one side renamed, the other still pointing at it;
- the loopback address asserted in the launch task, where the rule now lives, rather than in the caller;
- the preparation task's audit pins, untouched, since that delegation did not move;
- the report shape, the browser variables, and the stop message, untouched.

The stop message pin goes: with the Janissary teardown sentences gone, no task file quotes that string, and a pin with nothing to hold is a test that fails for no reason.

## Out of scope

- **Any change to the preparation task.** It gained the gate in the previous change and is not touched here.
- **The browser.** Connecting, holding a page open, and driving the app stay in the research task; the launch task reports an address and steps back.
- **Fixtures, seeds, and evidence.** Those are the caller's, written into the scratch root it named.
- **A readiness check stronger than the app's own output plus one real request.** Reading a bound address or a pid needs process inspection, which is not a pre-approved command here and cannot be answered by an unattended run.
- **Naming a stop command for any specific product.** A project that documents one is used; a project that does not is reported as unable to be stopped safely, and that is a stop condition rather than something to guess.
- **`work-an-issue.md`'s own app-launching.** It does not launch the app; it builds and tests. Nothing else in `ai/tasks/` launches the project today, so this task has one caller and is written for that.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the research task for `scratch`, `build`, and `127.0.0.1` and confirm each remaining mention either points at the launch task or is the caller's own use of the scratch root it named; confirm no file in `ai/tasks/` still describes building or launching the app outside the launch task and its caller.
