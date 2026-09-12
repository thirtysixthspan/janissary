# Make the controller's adapter wiring a compile-time check

**Complexity: 5/10** — one new composition module, a reshaped `src/controller.ts`, a parameter-type change in `src/state-event.ts`, and eleven construction sites that swap `new Controller(...)` for a factory call. No behavior a user can observe changes, and the public member surface is identical.

`src/controller.ts` assembles its five adapter surfaces with `Object.assign(this, createTabControllerAdapter(...), …)` while the class type claims those members through `interface Controller extends TabControllerAdapter, …` declaration merging. The two constructs are independent: an adapter factory dropped from the `Object.assign` list still typechecks against an interface whose members nothing implements. The file documents the hole itself, with two `@typescript-eslint/no-unsafe-declaration-merging` disables, and leaves it policed by a runtime walk in `src/controller.test.ts` that asserts every member of every factory is callable on a constructed controller.

## Goal

Dropping, renaming, or mis-typing an adapter factory in the controller's composition is a compile error. The two eslint disables go away, and no type assertion replaces them.

## Design decisions

**One composition function returning an intersection.** `createControllerAdapters(managers)` spreads all five factory results and declares its return type as `ControllerMembers` — the intersection of the five adapter interfaces. A spread that omits a factory produces an object type missing that factory's members, and the return type rejects it. This is the whole check, and it costs one function.

**A factory instead of `new`, so the merging goes away honestly.** `@typescript-eslint/no-unsafe-declaration-merging` fires on any interface/class pair sharing a name, so keeping `export class Controller` keeps the disables no matter how the assign is typed. Instead `ControllerCore` is the class, `Controller` becomes `ControllerCore & ControllerMembers`, and `createController(sinks, projectDir?)` returns `Object.assign(core, createControllerAdapters(core.managers))` — whose type `Object.assign` already computes as that intersection. No assertion anywhere, and the eleven `new Controller(...)` call sites become `createController(...)`.

**`Controller` stays the exported type name.** Every consumer that imports `Controller` does so `import type`; `src/message-handler.ts`, `src/message-handler-file-navigator.ts`, and `src/state-event.ts` need no edit beyond the one below. Only the five test files and `src/index.ts` that construct one change.

**`buildStateEvent` takes the core, not the composed type.** `ControllerCore.stateEvent()` passes `this`, which is a `ControllerCore` and not yet the intersection. `src/state-event.ts` only reads `managers`, `view()`, `routeView()`, `harnessLaunchView()`, `scheduleLaunchView()`, and `rootDir` — all core members — so its parameter becomes `ControllerCore`. Narrowing the parameter accepts strictly more callers, so nothing else moves.

**`schedule.start()` runs after the adapters are attached.** Today it is the last statement of the constructor. In the factory it is the last statement of `createController`, so the object is fully composed before any scheduled work can reach it — the same ordering guarantee, stated where the composition happens.

**The runtime walk moves rather than disappears.** The compiler now owns "every member is present in the record", so `src/controller.test.ts` no longer needs to import all five factories. What it keeps is the one thing the compiler cannot see — that `createController` actually assigns the record onto the instance — expressed as a walk over `createControllerAdapters(c.managers)`'s own keys. The per-factory coverage moves to a colocated test next to the new module.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The five adapter factories and their exported interfaces | `src/controller/tab-adapter.ts`, `monitor-adapter.ts`, `editor-adapter.ts`, `file-navigator-adapter.ts`, `plugin-adapter.ts` |
| Manager construction and event wiring | `src/controller/create-managers.ts`, `src/controller/events.ts` |
| The existing composition walk to relocate | `src/controller.test.ts` (`Controller adapter composition`) |
| The single production construction site | `src/index.ts:61` |

## Implementation steps

1. **New module `src/controller/create-adapters.ts`.** Import the five factories and their types. Export `type ControllerMembers = TabControllerAdapter & MonitorControllerAdapter & EditorControllerAdapter & FileNavigatorControllerAdapter & PluginControllerAdapter` and `export function createControllerAdapters(managers: Managers): ControllerMembers` returning the spread of all five factory calls.

2. **`src/controller.ts`: rename the class and add the factory.** Rename `export class Controller` to `export class ControllerCore`, drop the merged `interface Controller` and both `@typescript-eslint/no-unsafe-declaration-merging` disables, and drop the five adapter imports the constructor used. The constructor keeps `createManagers` and `wireControllerEvents` and loses the `Object.assign` and the `schedule.start()`. Add `export type Controller = ControllerCore & ControllerMembers` and `export function createController(sinks: Sinks, projectDir?: string): Controller` that constructs the core, `Object.assign`s the adapter record onto it, calls `managers.schedule.start()`, and returns it.

3. **`src/state-event.ts`: take the core type.** Change `buildStateEvent`'s parameter from `Controller` to `ControllerCore`, importing that instead.

4. **`src/index.ts`: construct through the factory.** `import { createController }` and replace `new Controller({ … })` with `createController({ … })`.

5. **Retarget the construction sites in tests.** `src/controller.test.ts`, `src/controller/create-managers.test.ts`, `src/controller/shell.unsandboxed.test.ts`, and `src/managers.test.ts` each import `Controller` as a value and call `new Controller(...)`; change them to import `createController` (keeping `type Controller` where it is used as an annotation) and call it without `new`.

6. **Check the file-size limit.** `src/controller.ts` gains the factory and loses the interface; confirm it stays under the 200-line `max-lines` budget after the edit.

## Tests

- **New `src/controller/create-adapters.test.ts`** — against a controller's real `managers`: the composed record contains every key each of the five factories produces, and every value is a function; spot-check that one member per adapter delegates to the manager it wraps (e.g. `setActiveTab` reaches `managers.tab`, `pluginFailed` reaches `managers.plugins`).
- **`src/controller.test.ts`** — replace the `Controller adapter composition` walk: a controller built by `createController` exposes, as a function, every key of `createControllerAdapters(c.managers)`. The five factory imports go away; the rest of the file is untouched apart from the construction swap.
- **Must keep passing unchanged in behavior:** `src/controller/create-managers.test.ts`, `src/managers.test.ts`, `src/controller/shell.unsandboxed.test.ts`, `src/message-handler.test.ts`, `src/message-handler-exhaustive.test.ts`, `src/message-handler-file-navigator.test.ts`, `src/index.test.ts`.

## Out of scope

- **Splitting or shrinking `src/controller.test.ts` generally.** Only the composition walk and the construction calls change; its remaining ~1800 lines of behavioral tests stay as they are.
- **Reshaping the adapter interfaces themselves**, or moving members between adapters.
- **Changing how `ControllerCore`'s own methods (`view`, `dispatch`, `shutdown`, …) are declared.** They stay ordinary class members.
- **Any change to `Managers`, `MANAGER_DISPOSE_ORDER`, or manager construction.**
