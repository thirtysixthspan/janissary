# Add agent launch resolution

**Complexity: 5/10** — The bounded parser and resolver touch several modules, and real-path confinement, grant validation, and installed-package access need careful edge-case tests.

## Goal

Implement the canonical `agent` command as an awaited, autonomous task runner. Each invocation resolves an immutable task/skill/grant snapshot, owns its ACP execution and resources, and returns a status, response, and cleanup warnings. Local runs use a fresh or explicitly borrowed workspace; remote runs execute on the selected host. An optional lazy monitor observes and can terminate only its bound run.

## Decisions and dependencies

The launch parser accepts clauses in any order before the mandatory final `execute <task> <parameters...>`. It preserves the parameter tail byte-for-byte after the task-path token. Task and skill resolution happens on the execution host, preferring its execution workspace before installed Janissary files. Roots, paths, symlinks, and skill sidecars are confined and validated before content is read. Snapshots are immutable, and sidecars grant only known canonical whole-command names.

Each run has an independent UUID-backed owner. The original caller's identity and command context remain distinct from the execution workspace and host. Run cleanup owns only acquired workspace/remote references and tabs actually allocated for that run, waits for process and resource teardown, and preserves the first terminal outcome. Parent runs constrain child skills and command grants. The monitor is an observer, never the execution owner; its server-scoped projection and termination capability cannot select another run.

Remote selection supports inherited remote workspaces, explicit matching destinations, and run-only SSH connections for other hosts or explicit paths. It never falls back to local execution. Remote input resolution, readiness, activity, process release, and sandbox status are carried over a versioned protocol; uncertain bounded teardown is reported as a cleanup warning.

## Existing code to reuse

| Existing mechanism | Verified reference | Reuse and required change |
| --- | --- | --- |
| Recursive task discovery and source tagging | `src/tasks.ts`; `src/agent/task-resolution.ts` | Reuse task discovery with strict per-source traversal for agent runs while preserving the picker's tolerant behavior and project-first lookup. |
| Installed Janissary root and sandbox reads | `src/janissary-root.ts`; `src/sandbox/` | Resolve files on the execution host and allow only selected installed-skill support files under confinement, retaining secret denies. |
| Canonical commands and structured dispatch | `src/commands/`; `src/command/manager.ts`; `src/capture/` | Keep one registry and execution path, with server-owned invocation attribution and optional structured results; preserve void-command output capture. |
| ACP sessions and tool loop | `src/acp/` | Reuse the connection and loop with autonomous permission handling, model/effort negotiation, typed activity, and awaited bounded process-tree teardown. |
| Workspace and remote references | `src/workspace/`; `src/remote/` | Keep leases run-scoped, await release, preserve other users, and require remote release acknowledgment or report uncertainty. |
| Plugin and tab allocation | `src/plugins/`; `src/tab/` | Use the lazy plugin registry and carry trusted run ownership to actual allocations, including admitted deferred work, without exposing run IDs to plugins. |
| Questions and transcript rendering | `src/questions.ts`; `web/src/shared/transcript/` | Await question answers/cancellation and reuse sanitized read-only transcript rendering for monitor activity. |

## Proposed changes

The branch adds a pure launch parser, strict task and skill resolution, schema-versioned command grants, and packaging/confinement support. Exact parser errors, source precedence, immutable snapshots, explicit-path rules, symlink boundaries, missing sidecars, and malformed grants are recorded in `product/specs/agent-command.md`.

The canonical command creates an independent run and returns `status`, `response`, and `cleanupWarnings` after cleanup. Local execution provisions a fresh clone unless it can borrow the caller's tracked workspace or an explicitly named tracked workspace. Remote execution uses an established matching workspace or a run-only SSH target. In both cases, task and skill snapshots come from the execution host, while granted Janissary commands retain the captured original caller context. Model and effort are selected from provider-supported options; the default effort is `medium`. Autonomous ACP permissions use the least expansive offered approval option, while Janissary commands require exact whole-command grants. Questions are awaited, fenced examples are ignored, and nested runs cannot widen parent policy.

Run ownership propagates through canonical dispatch, plugin calls, tab/editor allocation, deferred plugin launches, and default-name remote retries. Only newly allocated tabs belong to a run. Late resources are disposed and rejected; admitted work is awaited before cleanup. Caller closure terminates its runs, monitor closure only detaches observation, and shutdown waits for run cleanup before disposing dependencies. Local and remote ACP process teardown is bounded and reported without replacing the task outcome.

The lazy `agent-monitor` plugin displays the launch, execution location, status, provider-reported activity, and final response. It has no prompt or command surface. Its server-owned tab-scoped projection is revisioned, coalesced, included in initial state, and updated through targeted events. Termination is scoped to the bound run and remains visible through cleanup. A monitor-creation failure remains the result response while cleanup failures are retained as warnings. If the execution host cannot confine ACP, the notifications feed receives exactly `Agent: sandboxing is disabled.`

The behavior spec, related ACP/application-command/remote/workspace specs, user guide, and `help.md` describe the resulting behavior. The help row lists the launch clauses and default effort. The implementation also updates package contents and the `ask-user` skill's `question` grant sidecar.

## Tests

The branch adds and extends tests for parser grammar and exact errors; task and skill precedence, confinement, and snapshots; sidecar validation; command attribution and output capture; nested policy; workspace references; caller and child lifecycles; allocation races; ACP negotiation, activity, process teardown, and cleanup warnings; remote framing, selection, readiness, and acknowledged release; monitor projection, termination, isolation, and lazy loading; and existing command/plugin compatibility. Packaging coverage verifies bundled skill files. User-facing descriptions and behavior specs are reconciled with the implemented paths.

## Verification

The branch's recorded verification covers diff-scoped lint, typechecking, and relevant server and web tests during implementation. A live confined scratch read was unavailable because nested `sandbox-exec` returned `sandbox_apply: Operation not permitted`. This plan records the implementation and its verification history; it does not assert that those checks were run during a later documentation update.

## Out of scope

Hard filesystem or native skill-loader isolation, MCP command bridges, `AsyncLocalStorage` attribution, separate agent model/effort catalogs, run-listing or headless-cancellation commands, interactive monitor input, implicit skill loading, automatic provider retries, and adoption of pre-existing tabs are not included. Runs require a workspace; explicit remote target failure does not fall back locally. The feature does not roll back durable effects of granted commands or change unrelated ACP consumer policies.
