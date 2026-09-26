# Pin the literals the spec-testing playbook matches against application code

**Complexity: 2/10** — one test file, no application code. The pattern already exists in the repository and this copies it.

`ai/tasks/research/find-bugs.md` runs unattended and decides what to do next by matching text other code prints: the launcher's `failed to start: timed out waiting for the server`, its `__JANUS_URL__` readiness marker, the stop command's `no running janus instance for <dir>`, the server's refusal to start without `web/dist`, the `sandboxWorkspaces` key it writes into a scratch project, and the `npm run build` it runs. Nothing in the repository checks any of those against the code that produces them. Reword one and no test fails: the playbook goes on giving confident instructions for output that no longer exists, an unattended run misreads a real start failure, and the bug it files describes a message the app never printed. `scripts/docs-screenshots/task-playbook.test.mjs` already exists for precisely this hazard about the other unattended task that reads a script's output, and says so in its own comment.

## Approach

**A sibling test, in the shape of the existing one.** `scripts/find-bugs-playbook.test.mjs` reads the playbook and asserts, for each literal it quotes, that the code which produces the literal still contains it. Both sides of each assertion matter: the playbook quoting a string nothing prints, and the code printing a string the playbook never mentions, are the same drift seen from opposite ends.

**The report shape is pinned against the plan.** The ten report lines are written twice — once in the plan, once in the playbook — and only one of them is what a run prints. The plan's list is extracted and each line asserted present in the playbook, so the two cannot drift apart silently.

**The runner spelling keeps its negative pin, in the form this playbook needs.** The existing test asserts its playbook never spells the runner relatively, which is right when the runner it invokes is the installation's. This playbook invokes both: the project's own runner for the project's own lockfile, and the installation's for a project that has none. Both spellings are asserted present in their documented roles, and a masking assertion catches the drift the negative pin exists for — a `scripts/run.mjs` that is neither `./scripts/run.mjs` nor `$janissary/scripts/run.mjs`.

**The browser variables are pinned to the guideline.** Step 1 sends the reader to `ai/guidelines/sandbox-e2e-browser.md` for what those two variables are, so that is where the assertion belongs: a rename in either place is caught.

## Implementation steps

1. `scripts/find-bugs-playbook.test.mjs` — new; the table of application literals, each asserted on both the playbook's side and the producing code's side.
2. The same file — the two browser variables, the report shape against the plan, the two runner spellings, and the masking assertion.
3. No change to the playbook. A pin that fails because the playbook was wrong is the test working; a pin that is edited to match the playbook is the test defeated, so nothing here is adjusted to make a failure go away.

## Tests

This change is the test. `scripts/find-bugs-playbook.test.mjs` covers:

- each application literal — the launcher's timeout message and readiness marker, the server's readiness line and missing-bundle path, the stop command's message, the config key in both the defaults and the decoder, and the build script — present in the playbook and still present in the code that produces it.
- `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` named in both the playbook and the browser guideline.
- all ten report lines extracted from the plan, and each present verbatim in the playbook.
- both runner spellings present in their own roles, and no `scripts/run.mjs` left once those two are masked.
- the audit command naming a lockfile, since that is the form the gate's own test also pins.

## Out of scope

- **Prose, structure, and step order.** `scripts/docs-screenshots/task-playbook.test.mjs` pins "only the literals an agent matches on, not prose or structure", and so does this. A rewording that keeps every literal intact is not this test's business.
- **The literals the guide quotes rather than the code.** `ai/guidelines/sandbox-e2e-browser.md` is pinned only for the two variable names, which is the contract between the two files; its own quotations are that file's business.
- **The stop command's full line.** The playbook quotes the message up to the directory it interpolates, so the pin stops there; pinning the template literal as well would duplicate `src/stop-instance.test.ts`, which already asserts the exact string.
- **A test for the other research tasks.** Four of them read code and record findings; only this one matches a process's output as its control flow. The other unattended task with a machine interface already has its pin.
- **Anything in `src/` or `web/src/`.** No application code changes, so no coverage there is involved.

## Verification

Automated: `./scripts/run.mjs check-diff`, which runs the new file with the server tests.

Manual, performed: rewording the launcher's timeout message in `bin/janus.mjs` to one the playbook does not quote failed the pin with the launcher named as the side that moved; restoring the file returned the file to green. Rewording it by *appending* a word does not fail the pin, and should not: the playbook's quoted text still appears in what the app prints, so a run's match still works. What the pin exists to catch is a message that has been reworded away or reordered, and that it catches.
