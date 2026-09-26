# Keep the app under test on loopback, or do not start it

**Complexity: 2/10** — three paragraphs in one task prompt, one sentence in one spec. No code, no test, no architecture.

`ai/tasks/research/find-bugs.md` tells the run to "Serve web apps on `127.0.0.1`, using the project's own local-only option", and then starts the app and confirms readiness "from its output and an actual response". Nothing establishes that such an option exists, nothing reads back the address the process actually bound, and no other reason to stop is named. A documented start command that binds every interface is ordinary — a Python development server, `uvicorn --host 0.0.0.0` in anything written against containers, a bundler dev server started with a host flag — and this run would start it, drive it through the attached browser, and hold it there for the length of the testing, on a tab that is not necessarily confined at all: `ai/guidelines/sandbox-e2e-browser.md` and `src/sandbox/environment.ts` both record configurations with no sandbox boundary.

## Approach

**Make the bind address something the run establishes rather than something it assumes.** Two steps, in the order the task already has them.

**Discovery decides whether the project can be served locally at all.** A project under test must be startable with an explicit loopback address named in its own instructions. Where no such form can be determined, the run stops before starting anything, and reports it as an environment limitation rather than as a start failure to retry — a project that cannot be kept local is not broken, and retrying it will not change that.

**Startup confirms the address from what the process says.** The start command must name the loopback address, and readiness reads the address back from the server's own startup output where it prints one. The check comes from the command line and the output, never from inspecting the process or the socket: `ai/tasks/take-documentation-screenshots.md` records that process inspection is not a pre-approved command in this repository, so an unattended run would sit waiting on an approval it can never be granted.

**Say what was exposed.** The bound address goes on the report's `App:` line, and a non-loopback bind joins the forbidden list as a stop rather than a note. Janissary's own worked example already satisfies all of this — `src/index.ts` defaults the server host to `127.0.0.1`, `src/security.ts` refuses non-loopback request origins, and `scripts/docs-screenshots/scratch.mjs` binds loopback explicitly — so the rule exists for the other projects the task also claims to work on.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — Step 3: require an explicit loopback bind in the discovered start command, and stop with that reason when the project has none.
2. `ai/tasks/research/find-bugs.md` — Step 4: require the address in the command, read it back from the startup output when printed, and forbid reaching for process or socket inspection.
3. `ai/tasks/research/find-bugs.md` — forbidden list and the report's `App:` line.
4. `product/specs/task-picker.md` — one sentence in "Finding bugs from specs": a web app is served on loopback only, and a project that cannot be is not started.

## Tests

None, and none is possible: this is a prose playbook whose behavior is a decision made at run time about another project's start command. A test could only pin the wording, which the next entry does for the literals this playbook quotes. The gate is that a project with no loopback form stops in Step 3 before any build, which is observable in a run's report rather than in a suite.

## Out of scope

- **Inspecting the listening socket to confirm the address.** It is the stronger check and it is unavailable: process inspection is not pre-approved here, and an unattended run cannot answer a prompt.
- **Refusing to test an app that binds loopback plus a second interface.** The rule is loopback only, which is what the design decision asked for; a project that insists on more is a project that gets stopped.
- **Sandboxing the app under test.** The task deliberately tests the real thing, and the outer sandbox, where one exists, is the boundary.
- **Changing what the run reports overall.** Only the `App:` line gains the address; the fixed report shape keeps its ten lines.
- **A start-failure retry for this case.** A non-loopback bind is not a failure, so it is not retried and never reaches the startup-bug research.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: on a project whose documented start command binds every interface, confirm the run stops in Step 3 with that reason and starts nothing; on one that takes `--host 127.0.0.1`, confirm the address appears on the `App:` line.
