# Stop restating the browser connection mechanics in the spec-testing task

**Complexity: 1/10** — four sentences out of one paragraph. No code, no test, no spec change.

`ai/tasks/research/find-bugs.md` points the run at `ai/guidelines/sandbox-e2e-browser.md` for the connection and lifecycle rules, and then restates four of them: run a driver under `JANISSARY_NODE` when it is set, import Playwright from `JANISSARY_PLAYWRIGHT` rather than the project's own copy, connect with `chromium.connect` and never `connectOverCDP` or `chromium.launch()`, and reach the CommonJS package through `createRequire` or a dynamic import's `.default`. The guideline is the installed operating manual for all of it, and it is where a run is already sent one sentence earlier. The copy in the task is a second place to fall behind, and the last item is the clearest evidence of that: a detail about module interop that has no business being in a task whose subject is finding bugs in someone else's product.

What replaces the four sentences is nothing. The paragraph keeps its link and its instruction to read the guideline, which is where each of the four already lives in more detail than the task had room for.

Two things this does not touch, because they are not the agent's own runtime:

- **The pseudo-terminal driver in Step 5**, which says to use an existing `node-pty` or Python's standard-library `pty` and to install nothing. That is about getting the *tool under test* to accept keystrokes, not about how the run itself executes.
- **The two browser variable names** Step 1 gates on, which stay because the gate is the task's own precondition, and which the pin test asserts in both this file and the guideline.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — the restated mechanics in Step 1, leaving the guideline link and the instruction to read it.

## Tests

None needed, and one that must keep passing: `scripts/find-bugs-playbook.test.mjs` asserts `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` appear in both this task and the browser guideline. Both names survive here in the gate sentence that precedes the paragraph, so the pin holds — and it is the pin that would have failed had the gate sentence gone with the rest. The suite passing untouched is the check that the removal was confined to the four sentences named.

## Out of scope

- **The guideline.** It is the source of these rules and is not edited; if any of them is wrong, it is wrong there first.
- **The `Not tested` handling for a lost browser**, and the three things that end a session. Those are the task's own recovery rules and are stated in the task, not borrowed from the guideline.
- **The holder process in Step 4**, which already points at the guideline rather than restating it — the shape this change brings Step 1 into line with.
- **The spec.** It describes the browser prerequisite as a harness launched with the E2E browser attached, with no mechanics in it.
- **The plan.** It already records that the guideline is what directs the connection, so removing the copy brings the task into line with the plan rather than away from it.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the task for `JANISSARY_NODE`, `createRequire`, `connectOverCDP`, and `chromium.launch` and confirm none is left, while both browser variable names still appear in the gate sentence.
