# React Code Organization

How to organize components, hooks, and service classes in the React app so features stay decoupled and independently testable. These are constraints, not suggestions — when a change conflicts with one, that is a design discussion, not a thing to work around.

This document covers *where code lives and what may depend on what*. It sits alongside [`code-guidelines.md`](code-guidelines.md) (file size, one responsibility per file) and [`imports-and-barrel-files.md`](imports-and-barrel-files.md) (direct imports, no barrels), both of which apply here unchanged.

---

## 1. Organize by feature, not by file type

The default instinct is to group by what a file *is* — every component in `components/`, every hook in `hooks/`, every helper in `utils/`. That reads well at twenty files and collapses at two hundred: one feature's code ends up scattered across four directories, no directory tells you what the product does, and "does anything else use this?" becomes unanswerable without a grep.

Group by what the code *is for*. A directory name should name a piece of the product — `editor/`, `file-navigator/`, `notifications/` — so the structure describes the application rather than the framework. This is the mainstream default for production React and the organizing idea behind Bulletproof React and "screaming architecture."

A feature directory holds everything that belongs to that feature: its components, its hooks, its pure logic modules, its types, and its colocated tests. Include only the parts the feature actually has — do not create empty `components/`/`hooks/`/`types/` subdirectories as scaffolding. A feature small enough to be a handful of flat files inside its directory should stay that way; add interior structure when the file count makes it hard to scan, not before.

**Rule.** New code goes in a directory named after the feature it serves. Never add a file to a type-named bucket (`components/`, `hooks/`, `utils/`) when a feature owns it.

## 2. Colocate; promote to shared only on the second consumer

Files that change together live together. A helper used by exactly one component belongs beside that component, not in a global utilities module — colocation is what keeps a feature deletable and reviewable as a unit.

Promote code to a shared location when a *second* feature genuinely needs it, and not in anticipation of one. Premature sharing is how a shared layer fills with single-consumer code that nobody dares change. When you do promote, move the file — don't leave a copy behind or re-export it from its old home.

Shared code must earn its generality: once a module is shared, it may not take on knowledge of any particular feature. If making a shared helper work for a second caller requires a feature-specific branch or flag, that is the signal it should have stayed two separate colocated helpers.

**Rule.** Colocate by default. Move to shared on the second real consumer, and only if the module can serve both without feature-specific special-casing.

## 3. Dependencies flow one way: shared → feature → app

Three layers, and imports only ever point leftward:

- **Shared** — generic UI primitives, framework-free utilities, wire types, cross-cutting hooks. Imports nothing from features or the app shell.
- **Feature** — one product capability. Imports shared. **Never imports another feature.**
- **App shell** — routing, layout, providers, composition. Imports features and shared; nothing imports it.

The no-cross-feature-imports rule is the load-bearing one. The moment `feature-a` imports from `feature-b`, both stop being independently understandable, testable, and removable, and you have a cycle waiting to happen. When two features need to interact, one of three things is true: the shared thing between them belongs in the shared layer, the coordination belongs in the app shell that composes both, or they are actually one feature that should be merged.

This is mechanically enforceable with ESLint's `import/no-restricted-paths` (zone per layer, plus one zone per feature directory). Prefer enforcement over vigilance — a boundary that only exists in a document erodes.

**Rule.** No feature imports another feature. If you need that import, lift the shared part into the shared layer, coordinate in the app shell, or merge the features.

## 4. The feature boundary is the directory, not an index file

The common way to publish a feature's "public API" is a barrel `index.ts` re-exporting the parts outsiders may use. **We do not do that** — see [`imports-and-barrel-files.md`](imports-and-barrel-files.md). Barrels add an indirection hop that breaks "go to definition," and they defeat bundler tree-shaking.

The boundary still exists; it is just expressed differently. Callers outside a feature import the specific file that defines the symbol, and the lint zones from §3 say which files that may be. Inside the feature, anything may import anything. Keep the intended entry points obvious by naming — the tab body, the top-level component, the feature's hook — rather than by a re-export list.

**Rule.** Import every symbol directly from its defining module. Never introduce an `index.ts` re-export hub to mark a feature boundary.

---

## 5. Components render; they do not decide

A component's job is to turn props and view state into markup and to forward user intents. Everything else — data shaping, business rules, protocol calls, persistence — belongs in a hook or a plain module beneath it.

Two useful kinds, without ceremony about the labels:

- **Presentational** — props in, JSX out. No data fetching, no protocol access, no global state reads. These are the components that are trivial to test and reuse, so push logic *out* of a component until it becomes one.
- **Feature/container** — composes presentational components, calls the feature's hooks, and wires intents to handlers. Holds coordination, not algorithms.

Props are the contract. A presentational component should take the data it renders and the callbacks it invokes, never a service instance or a whole application state object it must dig through — passing the smallest sufficient prop is what makes the component reusable and its tests short. When a props list grows unwieldy, that usually means the component is doing two jobs, not that it needs a bag object.

One component per file, named for what it renders. When a component file approaches the 200-line limit, extract a real piece — a subcomponent, or its logic into a hook — never compact the code to fit.

**Rule.** Keep decisions out of JSX. If a component contains a rule you would want to unit test, that rule is in the wrong place.

## 6. Hooks are the seam between logic and view

A custom hook is how stateful, reactive logic reaches a component without the component owning it. It is the adapter layer: it subscribes, tracks React state, manages effect lifecycles, and hands the component a small, intention-revealing result.

What belongs in a hook:

- Logic that calls at least one React hook. If a function calls none, it is a plain function and must **not** carry the `use` prefix — the prefix is what tells the linter and the reader where state and effects hide.
- A concrete, high-level purpose, named for that purpose: `useTranscriptScroll`, `useEditorFind`, `useWindowFocus`. Not generic lifecycle wrappers (`useMount`, `useUpdateEffect`) — those fight React's model and hide dependency mistakes from the linter.
- One responsibility. A hook that returns three unrelated groups of values is three hooks.

What does not:

- Pure computation. Sorting, formatting, parsing, matching — plain functions, so callers may invoke them conditionally and test them without rendering.
- Effects with no subscription or lifecycle to manage, where a plain event handler would do.

Custom hooks share *stateful logic, not state*. Two components calling the same hook get two independent states. When components must see the same value, lift the state to a common owner and pass it down, or expose it through a context provider — do not assume a shared hook makes it shared.

Extract a hook when logic is duplicated, when an effect is substantial enough to obscure the component, or when naming it makes the component read as intent. Don't extract for a couple of duplicated lines; a little duplication is cheaper than a bad abstraction.

**Rule.** Hooks wrap reactive logic and are named for their purpose. Non-reactive logic is a plain function, never a `use*`.

## 7. Service classes are framework-free and injected

A service is the part of a feature that talks to the outside world or holds non-visual logic: a protocol client, a session/connection object, a cache, a parser with state. It must be written as if React did not exist — no hooks, no JSX, no component imports, no assumption about when React renders.

Design constraints:

- **A pure core.** Parsing, validation, and computation are pure functions returning values; effects (sockets, storage, timers, the DOM) live in the service's execution paths and stay separated from that core.
- **Explicit lifecycle.** A service that acquires anything — a socket, a listener, a timer, an observer — exposes teardown alongside acquisition, so one `dispose()` releases everything it owns. The hook that owns the instance calls it from its effect cleanup.
- **Subscription over polling.** Services notify via listener registration returning an unsubscribe function; the hook bridges those notifications into React state.
- **Instantiated at the edge, not imported into components.** Create the instance once at the app boundary and pass it down — through props for narrow reach, through a context provider for wide reach. A module-level singleton imported directly into a component is a hidden global: it cannot be swapped in tests and it silently couples every importer to one instance.
- **Class or module, whichever fits.** Use a class when there is per-instance state and lifecycle; a module of exported functions is better when there is neither. Do not wrap a stateless module in a class for symmetry.

Type-first at the boundary: a service's inputs and outputs use the shared wire types, never locally re-declared shapes (see [`architecture-principles.md`](architecture-principles.md) §7).

**Rule.** Services never import React. Components never construct services. The hook in between owns the instance's lifecycle and adapts it to render.

## 8. The four layers, and what each may know

| Layer | Contains | May import | Tested by |
| --- | --- | --- | --- |
| Pure module | parsing, formatting, matching, reducers | other pure modules | plain function calls |
| Service | protocol clients, sessions, caches, lifecycle | pure modules | direct instantiation, fakes for I/O |
| Hook | React state, effects, subscriptions | services, pure modules | hook-level render tests |
| Component | markup, event wiring | hooks, other components, pure modules | render + interaction tests |

Each layer imports downward only. A component reaching past its hook straight into a service, or a service reaching up into a hook, is the coupling this table exists to prevent.

The practical payoff is testing. Most logic ends up in the top two rows, where tests need no DOM, no fake timers, and no render — which is exactly why pushing logic down out of components is worth the extra file.

---

## Applying this

When adding a feature: create the feature directory, put its pure logic in plain modules, wrap anything stateful in a service, expose it through one hook, and keep the components thin enough to read as markup. Check that nothing you wrote imports another feature.

When changing a feature: keep new code inside that feature's directory. If it seems to need something from a sibling feature, stop and resolve it per §3 rather than adding the import.

When a file exceeds 200 lines: extract a cohesive piece into a new module in the same feature directory — a subcomponent, a hook, or a pure module. Never compact code or strip comments to fit.

**AI assistants:** default to feature-directory + pure module + service + hook + thin component, colocate the test, and surface — don't silently resolve — any request that forces a cross-feature import or a component that owns business logic.

