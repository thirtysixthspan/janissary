# plugin architecture guidance

How to design, build, and maintain plugins in this codebase. This document sets the design criteria and the rules. It deliberately does not specify a plugin API shape, a manifest schema, or a loader implementation. Those are design decisions for the change that introduces them, and they must satisfy everything below.

For the concrete bundled tab-plugin contract, read [[plugins-tabs]]. For the client-side editor-plugin contract — a chord bound in the editor tab, answering with edits and a selection — read `documentation/developer-documentation/editor-plugins.md`.

A plugin here means a unit of behavior that the host does not know about at build time, contributed through a published contract, loadable and disposable at runtime, and versioned separately from the code that hosts it. 

---

## 1. The host owns the contract; plugins never reach past it

The core depends on an interface, never on a concrete plugin, and the plugin depends on a narrow capability object, never on host internals. This is dependency inversion applied at the extension seam, and it is the single decision that determines whether the system stays maintainable.

This codebase already does this well and the pattern should be copied rather than reinvented. Look at `src/openers/types.ts`. An opener receives an `OpenContext` carrying eight functions and nothing else. It can note a line, mount one of five tab kinds, register a file for serving, or hand a file to the OS. It cannot touch the controller, the tab manager, or the socket. The dispatcher in `src/openers/index.ts` stays closed for modification while the registry stays open for extension, and that property comes entirely from how narrow the context is.

**Rule.** A plugin receives a purpose-built capability object, constructed by the host, exposing only what its contract promises. Never pass `Managers`, the controller, a tab session object, the WebSocket, or anything else that would let a plugin do more than its extension point describes. Adding a capability to that object is an API change and follows section 4.

## 2. Registry in, conditionals out

An extension point is a list the host walks, not a switch statement the host maintains. Adding a plugin adds an entry. It never edits a dispatcher.

The repo has three working examples with three different resolution strategies, and they are the vocabulary to reach for. `src/openers/index.ts` resolves by first match on a declared claim (file extensions), so exactly one opener runs. `src/commands/index.ts` resolves by `match(command)` predicate over an ordered list. `src/recognizers/` polls every recognizer and picks the winner by a reliability score, which is the right shape when several candidates are plausible and the host must arbitrate.

**Rule.** Pick a resolution strategy explicitly and document it in the extension point's own module: first match, all in order, or arbitrated. Never let it be an accident of array position. When order matters, see section 5.

## 3. Declare statically, activate lazily

Separate what a plugin offers from what a plugin does. The declaration is data the host can read without executing plugin code. The activation is code the host runs only once something needs it.

This is the split VS Code enforces between contribution points in the manifest and the imperative API behind `activate()`, and the payoff is real: the host can render menus, resolve routes, answer completions, and report what is installed without loading a single plugin module. It also means a broken plugin is visible in the UI as broken rather than invisible.

**Rule.** Anything the host needs in order to decide whether to load a plugin lives in the static declaration: identity, API version, extension points contributed, activation triggers, capabilities requested. Anything requiring host state lives behind activation. A plugin that must be loaded to find out what it does has failed this rule.

## 4. Version the contract, not just the package

Two version numbers exist and they are not the same thing. The plugin's own version follows semver and is the plugin author's concern. The host's plugin API version is the compatibility contract, and it is the one that governs whether a plugin loads at all.

Evolution of that contract is additive by default. Adding an optional field, a new hook, or a new capability is a minor bump. Removing anything, renaming anything, tightening a type, changing a payload's meaning, or changing execution order that plugins could observe is a major bump. Payloads that cross the boundary carry their own schema version when they can outlive a single call, which includes anything persisted to the state directory or replayed later.

Removal follows a window rather than a release. Add the replacement first. Keep the old path working behind a named compatibility shim. Warn once per process at the point of use, naming the replacement and the removal version. Only then remove, at least two minor releases later, with a migration note.

**Rule.** Never remove a documented contract in the same release that introduces its replacement. Every deprecation states its replacement and its removal version at the moment it is announced. A change that breaks a frozen compatibility fixture (section 11) is a major bump by definition, whatever it looked like in review.

## 5. Choose the extension mechanism deliberately

Four mechanisms cover almost everything, and mixing them carelessly is how plugin systems become unpredictable. Providers answer a question and the host picks one winner, which is what the openers registry does. Pipeline hooks transform a value in sequence, where each plugin sees the previous plugin's output and order is load bearing. Notification events tell plugins something happened, fan out with no ordering guarantee, and cannot influence the outcome. Commands and contributions add a new user-facing entry point rather than altering an existing flow.

Ordering deserves its own decision. Numeric priority numbers are a known trap because they turn ordering into a global negotiation between plugins that have never met. Prefer a coarse three-band scheme (pre, normal, post) with registration order breaking ties inside a band, which is what Rollup and Vite settled on after trying alternatives. If plugins genuinely depend on each other, declare the dependency by name and topologically sort at load, failing loudly on a cycle rather than picking an arbitrary order.

Async behavior is part of the contract, not an implementation detail. State per hook whether handlers run sequentially with each awaited, or concurrently. Sequential is the safe default for anything that transforms shared state. Concurrent is correct for independent notifications and should be used where it is correct, because it keeps activation cost off the critical path.

**Rule.** Every extension point documents four things in its own module: its resolution strategy, its ordering rule, its async semantics, and what a handler returning nothing means. If a plugin author has to experiment to learn any of these, the extension point is underspecified.

## 6. Load on demand, and pay nothing until then

A plugin that is installed but unused should cost close to zero. That is the whole point of on-demand loading, and it is easy to lose by accident.

On the server, load plugin modules with dynamic `import()` at activation, not at startup. Node caches the resolved module, so a second activation is cheap and the loader should not build its own cache on top. Discovery reads declarations only. It never imports plugin code to find out what a plugin is. Module top level must stay free of side effects: no connections opened, no files read, no timers started, no work that happens merely because the module was resolved. Work belongs in the activation function where the host can time it, contain its failures, and undo it.

On the client, the same discipline runs through Vite's code splitting. A plugin's React surface is a dynamic `import()` behind `React.lazy`, wrapped in `Suspense` for the loading state and an error boundary for the failure state, so a chunk that fails to fetch degrades to a message inside that one view instead of blanking the app. The plugin's chunk must not be pulled into the entry bundle by a stray static import from shared code, which is the usual way lazy loading silently stops working.

Activation triggers should be as narrow as the plugin can tolerate. Broad triggers that fire on startup or on every session are the reason editors get slow, and a trigger like "always" is a design smell that deserves a comment justifying it.

**Rule.** Discovery imports nothing. Activation is triggered by a declared condition, runs exactly once, and is timed by the host. Any module-level side effect in a plugin is a bug. Client plugin code ships in its own chunk and is never reachable from the entry bundle by a static import.

## 7. Contain failure to the plugin that caused it

One plugin's bad day must not become the host's. This is the reliability property that decides whether users trust plugins at all, and it is cheap to build in at the start and expensive to retrofit.

Load, activate, and every host to plugin call are individually guarded. A throw, a rejected promise, or a version mismatch disables that plugin, records why, and leaves everything else running. The failure is surfaced where a user will actually see it, which in this app means the transcript, the notifications tab, or the connections panel, not a silent log line. Slow is a failure mode too: a handler that exceeds its budget is treated as failed rather than allowed to stall the pipeline it sits in.

Nothing here makes plugin code trustworthy. Guarding calls prevents accidents, not attacks. See section 8.

**Rule.** No unguarded call across the plugin boundary in either direction. A disabled plugin reports its name, the reason, and what the user can do about it. The host starts successfully with every plugin broken.

## 8. Plugin code runs at host trust unless you isolate the process

Be honest about the threat model. In-process JavaScript plugins run with the full authority of the host process. Node's `vm` module is explicitly not a security boundary and never has been. A capability object is excellent design and real protection against mistakes, but it is not a sandbox, because a determined plugin sharing an isolate can reach around it.

Real isolation means a real boundary: a separate process communicating over RPC, which is the model VS Code chose, or an isolate with no host bindings. That is a significant cost and is only worth paying for untrusted third-party code. For plugins that ship in this repo or are installed deliberately by the user who is already running the app, the honest position is that they are trusted code, documented as trusted, with capability narrowing as defense in depth rather than as a security claim.

The app's local-first security boundary applies to plugins without exception. This server binds to loopback, requires a per-session token on the WebSocket upgrade, enforces a Host and Origin allowlist, and serves local files only from an explicit allow-list. A plugin does not get to open a port, register an unauthenticated route, serve a path outside the allow-list, or accept a connection that skips the guard. If a plugin needs to serve a file, it goes through the same registration path openers already use.

**Rule.** Document the trust level of plugins plainly and do not overclaim. Every ingress a plugin contributes passes through the existing token and Origin guard, and files go through the allow-list. Widening reach requires re-deriving the threat model and a test pinning the boundary.

## 9. Budget performance, and measure it

Set numbers before there is anything to measure, because after the fact every number looks acceptable. Activation has a budget, hot-path handlers have a tighter one, and the host records actual timings per plugin so a slow plugin can be named rather than guessed at.

Two hot paths in this app deserve specific care. `emitState` broadcasts the full view on essentially every mutation, including per-keystroke shell output and every ACP chunk, so a plugin handler on that path multiplies against a very high call count. Whole-world snapshots are also known to be the wrong long-term shape, because they bound neither payload size nor reconnection cost, and the app is meant to move toward sending only what changed with a sequence number the client can use to detect gaps. A plugin contract that assumes it can inspect the entire view on every tick is building on a foundation that is meant to change. Prefer contracts that hand a plugin the smallest slice it needs.

**Rule.** State the activation budget and the per-call budget in the extension point's documentation. Record per-plugin activation time and expose it. A plugin contract on a per-keystroke or per-chunk path needs an explicit justification and a tighter budget than one on a user-initiated path.

## 10. Integration points, server and client

Plugins attach on both sides, and the two sides connect only through the existing wire contract. That is the rule that keeps the rest of the architecture intact.

On the server, the natural attachment points already exist and a plugin should extend them rather than invent parallel ones. Commands attach through the `src/commands/` registry shape, where each command has exactly one definition and one execution path. File type handling attaches through the openers registry. Unprefixed command routing attaches through the recognizers. Anything owning per-agent resources attaches to the agent's session object, which owns its own state and exposes it only through its own methods, never as a new `Map<label, …>` on a manager. Long-lived subsystems appear in `Managers` and get a `dispose`.

On the client, plugin surfaces are React components mounted through the existing view layering, and the server remains the single source of truth without exception. The server owns all state and every rendering decision. The client renders what the server sends and emits intents back. A client plugin may own ephemeral view state such as scroll position or which overlay is open. It may not compute state the server also computes, and it may not derive transcript or tab state locally.

Between the two, `src/protocol.ts` is the only definition of the wire contract, imported by the client through the `@shared` alias. Plugin contributions that cross the boundary are types in that file. A plugin never opens its own socket, never mirrors a wire type in `web/src/`, and never invents a side channel. When a shared module is imported by the client for runtime values rather than types alone, all three alias declarations (`web/tsconfig.json`, `web/vite.config.ts`, the `client` project in `vitest.config.ts`) must resolve it.

**Rule.** Server plugins extend existing registries and own their state on the session object. Client plugins render server-provided state and emit intents. All cross-boundary shapes live in `src/protocol.ts` and are imported, not mirrored. A plugin that needs a new transport has misunderstood the architecture.

## 11. Make compatibility testable, not aspirational

Compatibility that is only described in prose decays. Freeze it in tests instead.

Keep small fixture plugins written against each API generation, and load them against the current host in CI, asserting that registration succeeds and that a representative call round-trips. A pull request that breaks a frozen fixture has made a breaking change, and that is the definition, not a judgment call. Beyond fixtures, the host's own guards need tests: a plugin that throws on activation leaves the host running, a version mismatch is refused with a useful message, and disposal actually releases what was acquired.

Tests are colocated as `*.test.ts(x)` and run through the diff-scoped commands (`./scripts/run.mjs check-diff`) while developing.

**Rule.** Every extension point ships with a fixture plugin and a failure test in the same change that introduces it. Every API version keeps its fixture forever, or until that version is formally removed.

## 12. Document the contract as carefully as you design it

Three audiences need different documents and conflating them is why plugin docs go stale.

Plugin authors need a reference for each extension point covering its purpose, the exact contract, the capability object, resolution and ordering, async semantics, activation triggers, error handling, performance budget, and the minimum API version. Lead every one of these with the simplest working example, then the interesting one. Generate what can be generated from the TypeScript types so the reference cannot drift from the code.

Users need to know what a plugin does, what capabilities it asks for, how to configure it, and which host versions it works with.

Maintainers need a changelog with every API change classified by semver impact, migration notes for every deprecation, and the removal schedule.

Docs are source of truth in this project and they move with the code rather than trailing it. A behavior change updates its spec file in `product/specs/` in the same change. A structural change updates the project's architecture docs in the same change. Documentation that lies about the code is worse than none, because it actively misleads both humans and AI agents, so stale docs are bugs and get fixed on sight.

**Rule.** An extension point is not finished until its reference page exists, its simplest example runs, and its spec file in `product/specs/` describes the behavior. Deprecations are documented when announced, not when removed.

## 13. Anti-patterns to reject on sight

Some of these have already cost this codebase real refactoring, and the rest are well documented elsewhere.

Passing the whole host object, or `Managers`, as the plugin context. It makes every internal a de facto public API and freezes refactoring permanently.

Numeric priority integers for ordering, which force plugin authors to guess numbers relative to plugins they cannot see.

A parallel `Map<label, …>` on a manager for plugin state instead of ownership on the session object. This is how per-agent state ends up scattered across a dozen parallel maps keyed by label, where every new concern adds another map and every lifecycle path has to remember to touch all of them. It is the reason `src/tab/manager.ts` carries a `max-lines` suppression today.

Mirroring a wire type in `web/src/` for convenience, which is the textbook cause of type drift: change a shape on one side, forget the other, and the mismatch surfaces only at runtime.

Loading every plugin at startup so discovery is simpler.

Side effects at module top level.

Silent failures, where a broken plugin is indistinguishable from an absent one.

A second definition of something that already has one, whether that is a command, a wire type, or a resolution path. The rule is blunt: one definition, one execution path, and no code path the system never takes. When a migration leaves scaffolding behind, removing it is part of finishing the migration and not a separate cleanup for someday.

---

## Checklists

**Before adding an extension point.** Define the capability object and confirm it exposes nothing beyond the contract. Pick and document resolution, ordering, and async semantics. Decide the activation trigger. Set the activation and per-call budgets. Write the fixture plugin and the failure test. Write the reference page with the simplest example first. Update the spec.

**Before shipping a plugin.** Confirm the static declaration is complete and honest. Confirm no module-level side effects. Confirm activation is under budget. Confirm every acquire has a matching release in `dispose`. Confirm no wire type is redeclared locally. Confirm failure paths surface a useful message. Confirm files stay under 200 lines, splitting by extraction rather than compaction. Run `./scripts/run.mjs check-diff`.

**Before changing the plugin API.** Classify the change against section 4. Run the frozen fixtures. If anything breaks, it is a major bump. Add the replacement before removing anything. Announce the deprecation with its replacement and removal version. Update the changelog and the migration notes.
