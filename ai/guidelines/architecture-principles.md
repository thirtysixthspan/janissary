# architecture principles

Guidance for developers and AI assistants evolving this codebase. These principles are derived from the current architecture (a Node server in `src/` driving a React SPA in `web/` over one WebSocket) and from established practice for authoritative client-server, actor-style, and type-safe full-stack systems.

When a change conflicts with a principle, that is a design discussion — not a thing to silently work around. Prefer the smallest change that keeps every principle true.

---

## 1. The server is the single source of truth; the client is a thin projection

The server owns all state and all rendering decisions. It runs `flattenBuffer` and ships `BufferLine[]` per tab, so the client never re-implements transcript logic — it renders snapshots and emits *intents* (`{ method, params }`), never derived state. This is the authoritative client-server model: the server validates every request and broadcasts a definitive snapshot rather than clients broadcasting isolated events.

**Rule.** Presentation logic that affects *what* is shown lives on the server. The client may own only ephemeral, view-local concerns (scroll position, which modal is open, cursor). Never fork a piece of state so both sides compute it — if the client needs it, the server sends it.

## 2. Each agent is one session object that owns its state

Today per-tab state is scattered across a dozen parallel maps in `Controller` — `shells`, `cwd`, `busy`, `harnessOf`, `acpSessions`, `acpInfo`, `ptys`, `schedules`, `tabDbConns`, `context`, `browsers`, `workspaces` — all keyed by label. Every new per-tab concern adds another map, and every lifecycle path must remember to touch all of them. The actor model is the antidote: encapsulate one agent's state behind one owner, mutated only through well-defined methods.

**Rule.** New per-agent state belongs *on the agent's session object*, not in a new `Map<label, …>` on the controller. An agent owns its shell, PTYs, ACP session, browser, schedule, and connections; nothing reaches into those from outside except through its methods.

## 3. The controller dispatches; feature services execute

`controller.ts` was once a ~1130-line God Object holding command routing, shell I/O, PTY management, ACP loops, browser glue, scheduling, messaging, globbing, file serving, and persistence in one class. It is now 242 lines and does none of that work itself: every method forwards to a manager on `Managers` or to a feature module (`controller/file-navigator.ts`, `editor/save.ts`, `page/sync.ts`, `monitor/window.ts`). Self-contained command logic lives in `src/commands/*.ts` per principle 5.

The pressure did not disappear — it moved. `src/tab/manager.ts` is now the largest non-test source file in the repo and the only one carrying an `/* eslint-disable max-lines */` suppression, because it absorbed the per-tab resource machinery principle 2 targets. That file, not the controller, is where this principle is currently unmet.

**Rule.** The controller maps an intent to a feature and delegates. Business logic lives in feature modules (`shell`, `db`, `browser-tab`, `schedule`, `messaging`, `acp-loop`, openers). When you find yourself adding a method to the controller, ask whether it belongs to a feature instead. Keep files at or under **200 lines**; a file that exceeds it is signalling that it should be split.

## 4. Parse pure, execute effectful — and never blur the seam

The codebase's biggest strength: `parseXCommand` functions (`parseDbCommand`, `parseScheduleCommand`, `parseConnectionCommand`, `parseOpen`, the recognizers) are pure — they return structured data or `{ error }` and do no I/O. Side effects live in the execution layer. This makes parsing trivially testable and routing predictable.

**Rule.** A parser returns a value; it never spawns a process, touches the filesystem, mutates state, or writes to a transcript. Effects happen only in the execution layer, which consumes parsed data. Protect this seam — it is why the recognizers and command tests stay simple.

## 5. One command, one definition — delete shadow systems

Each command has exactly **one** definition. Self-contained commands (`state`, `next`, `quit`, `hist`, `clear`, `msg`, `broadcast`, `schedule`, `db`) own their logic in `src/commands/<name>.ts` through a `run(command, CommandContext)` method; the controller builds the `CommandContext` for the tab and delegates. Commands that need the tab/PTY/session machinery the controller owns (`agent`, `profile`, `close`, `connection`, `acp`, `open`, `browser`) carry only `name`/`match` and execute in the controller's `runApp`. The earlier shadow system — vestigial `handler` functions plus the 40-field `CommandHandlerContext` describing a React-hook world that no longer existed — has been deleted; `CommandContext` is the single, narrow controller-facing surface.

**Rule.** Each command has exactly one definition and one execution path. When a migration leaves scaffolding behind, removing it is part of finishing the migration — not a separate "cleanup" someday. No code path that the system never takes. A new self-contained command belongs in its module behind `CommandContext`; only reach into the controller when a command genuinely needs machinery the context does not expose.

## 6. Every acquire has a matching release (symmetric lifecycle)

A tab can own a shell, PTYs, an ACP session and its info, a browser, a workspace clone, served `open` files, schedules, db-connection attributions, and message context. `closeTab` and `shutdown` must today manually tear down each one, in two places, from memory — a leak is one forgotten line away. Actors solve this by giving each entity a single `dispose()`; acquisition and release live together.

**Rule.** Resource acquisition and teardown are defined together, by the owner. Closing an agent disposes everything it owns through one call, not a hand-maintained checklist. If you add a resource to an agent, you add its teardown in the same change.

## 7. One wire contract, shared — not mirrored

`src/protocol.ts` is the only definition of the wire contract. The web app used to keep a hand-mirrored `web/src/protocol.ts` alongside it — the textbook cause of type drift, where changing an event shape on one side and forgetting the other surfaces only at runtime. That mirror is gone: `web/src/` imports `ServerEvent`, `RpcCall`, `TabView`, `BufferLine`, and the rest from `@shared/protocol`, so the compiler flags every affected site across both apps from a single edit.

The `@shared` alias is declared in three places that must agree: `web/tsconfig.json` (`paths`) for typechecking, `web/vite.config.ts` (`resolve.alias`) for the production build, and the `client` project in `vitest.config.ts` for tests. Most `@shared/*` imports are type-only and erased at transpile time, but some — `src/search-matches.ts`, `src/syntax-themes.ts`, `src/app-themes.ts` — are imported for real runtime values, which is why the bundler and test runner need the alias and not just the typechecker.

**Rule.** Wire types (`ServerEvent`, `ClientMessage`, `TabView`, …) have exactly one definition, in `src/protocol.ts`, that both server and client import. Never re-declare a wire shape locally in `web/src/` — not as a convenience copy, not as a "close enough" structural type. When you add a shared module that the client imports for runtime values rather than types alone, confirm all three alias declarations resolve it.

## 8. Synchronize by minimal, ordered change — not whole-world snapshots

`emitState` broadcasts the *entire* `view()` — every tab and every buffer line — on essentially every mutation (keystroke-driven shell output, each ACP chunk, each tick). It is simple and correct today at local-only scale, but it does not bound payload size or survive reconnection gracefully ("what did the client miss?" is the hardest WebSocket problem). The maturity path is sequence numbers or event sourcing so a reconnecting client replays only the delta.

**Rule.** Prefer sending what changed over re-sending the world. When adding high-frequency or large state, consider per-tab/targeted updates and a sequence/version so the client can detect gaps and resync. Keep the door open to reconnection-aware sync; don't bake in "full snapshot every event" as a load-bearing assumption.

## 9. Local-first security is an enforced, tested invariant

The strongest boundary in the system: the server binds to `127.0.0.1`, requires a per-session token on the WS upgrade, enforces a loopback Host/Origin allowlist (the DNS-rebinding guard), and serves local files *only* from the controller's `/open/<id>` allow-list — an arbitrary path is never reachable. This is verified by tests (bad token rejected, spoofed Host → 403).

**Rule.** Every new ingress — an HTTP route, an RPC method, a served file, a spawned process — passes through the same token + Origin/Host guard and, for files, an explicit allow-list. Never widen reach (bind beyond loopback, accept an unauthenticated route) without re-deriving the threat model first, and ship a test that pins the boundary.

## 10. Specs and docs are source of truth — and they evolve with the code

`product/specs/` is declared authoritative ("when behavior is ambiguous, the spec is the source of truth"), yet architecture docs here have gone stale before: earlier docs (`AI.md`, a migration map) described components like `cli.tsx` and `src/server/*` paths long after they were removed or flattened into `src/`. Documentation that lies about the code is worse than none — it actively misleads both humans and AI agents.

**Rule.** A behavior change updates its `product/specs/` file in the same change; a structural change updates the architecture docs (`CLAUDE.md`'s project-structure section, the affected `ai/guidelines/` files) in the same change. Behavior ships with a test (vitest, colocated `*.test.ts(x)`) — the suite is the executable half of the spec. Stale architecture docs are bugs; fix them on sight.

---

## How to use these

- **Developers:** before opening a PR, check it against principles 2–7 (the ones most easily eroded). If you added a `Map<label, …>` keyed by tab label, grew a file past 200 lines, or declared a wire type in `web/src/` instead of importing it from `@shared/protocol`, reconsider.
- **AI assistants:** treat these as constraints, not suggestions. When asked to "add a feature," default to a feature module + a session-owned resource, wire one command definition, update the spec and a test, and keep the controller change to delegation. Surface — don't silently resolve — any request that forces a principle to break.
