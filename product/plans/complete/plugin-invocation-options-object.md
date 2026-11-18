# Replace plugin invocation positional chains with one options object

**Complexity: 4/10** — ~45 added lines across three production files, one new named options type, 5 requirements and 5 test scenarios (p=4.955); no new architecture.

## Goal

`invokePlugin` and `createPluginContext` currently end in long positional tails whose optional string and callback parameters appear in different orders and are threaded through `undefined` placeholders. In `invokePlugin` the tail is `answeringLabel?, disable?, adoptPtyId?`; in `createPluginContext` it is `openRequests?, answeringLabel?, deadline?, deferred?, adoptPtyId?, disable?` — `adoptPtyId` and `disable` sit in opposite positions. A caller that swaps two same-typed optional arguments typechecks and silently misroutes the failure-disabling callback or the adopted PTY id. Make each argument's meaning explicit at every call layer by passing one named options object.

## Approach

Define one exported `PluginInvocationOptions` type in `context.ts` carrying `openRequests`, `answeringLabel`, `deadline`, `deferred`, `adoptPtyId` and `disable` by name, with the existing per-field comments moved onto the type. Both `invokePlugin` and `createPluginContext` take it as a single trailing optional parameter defaulting to `{}`.

`invokePlugin` reads only `answeringLabel`, `disable` and `adoptPtyId` from what its callers pass; it owns `openRequests`, `deadline` and `deferred` internally and supplies them when it builds the context options. Its `deferred.invoke` recursion forwards the whole options object with a new `answeringLabel`, so any future field propagates automatically. `createPluginContext` destructures all six fields and its body is otherwise unchanged. Passing `disable` straight through (rather than the old `disable && (error, origin) => disable?.(error, origin)` wrapper) is equivalent because `updateTabCapability` already treats it as optional.

In `host.ts` the private `invoke` takes a small inline options object (`answeringLabel`, `adoptPtyId`, `timeoutMs`) with a default, so the constructor's `invoke` port stops passing `undefined, undefined, timeoutMs`, `reattach` stops passing `undefined, adoptPtyId`, and `requestPort` passes `{ answeringLabel }` by name. The private method builds the `invokePlugin` options object with the host's `disable` callback. `guardPluginCall` and the capability modules are untouched.

## Implementation

1. In `src/plugins/context.ts`, add and export `PluginInvocationOptions` with the six named optional fields and their comments; change `createPluginContext`'s trailing positional tail to `options: PluginInvocationOptions = {}`; destructure the six fields at the top of the function and leave the returned capability object unchanged.
2. In `src/plugins/invoke.ts`, import the new type; change `invokePlugin`'s trailing tail to `options: PluginInvocationOptions = {}`; destructure `answeringLabel`, `disable`, `adoptPtyId`; change `deferred.invoke` to forward `{ ...options, answeringLabel: laterAnswering }`; change the `createPluginContext` call to pass `{ ...options, openRequests, deadline, deferred }`.
3. In `src/plugins/host.ts`, change the private `invoke` signature to take an inline options object and update its `invokePlugin` call to pass the named options; update the constructor `invoke` port, the `reattach` port and the `requestPort` `invoke` port to use named fields. Leave `runGuarded`'s call unchanged.
4. Update the `createPluginContext` call sites that pass a sixth argument: `src/plugins/context.test.ts` (three calls), `src/plugins/shell-capabilities.test.ts` (the calls that pass `[]` for `openRequests` and/or a string for `answeringLabel`), and `src/plugins/shell/follow-cwd.test.ts` (one call). Calls that pass only the five required arguments need no change.
5. Run `$janissary/scripts/run.mjs check-diff` after each step and fix any failure before continuing.

## Tests

- **`src/plugins/invoke.test.ts`** (new): mock `createPluginContext` to capture the options object at each call layer. One case drives an `invokePlugin` call with `disable` and `adoptPtyId`, then invokes the captured `deferred.invoke`, asserting the deferred call's captured options carry the new `answeringLabel`, still carry `adoptPtyId`, still carry a `deferred` object, and that its `deferred.disable` reaches the host callback with the original origin. A second case asserts no `deferred` is created without `disable`.
- `src/plugins/context.test.ts`, `src/plugins/host.test.ts`, `src/plugins/shell-capabilities.test.ts`, `src/plugins/shell/follow-cwd.test.ts`, `src/plugins/launch-tab.test.ts`, `src/plugins/context.test.ts` and the other suites that build contexts must keep passing unchanged in behavior.

## Out of scope

- The capability factory modules (`launchCapabilities`, `lineCapabilities`, `queueCapabilities`, `acpCapabilities`, `remoteCapabilities`) and their own input objects.
- `guardPluginCall`, the failure boundary, or any user-observable behavior — this is a refactor only.
- Moving `PluginInvocationOptions` to a separate module; it lives with `createPluginContext`, its primary consumer.

## Documentation and specification impact

None. No flag, command, key binding, or user-visible behavior changes, so no spec, `help/` or `documentation/user-documentation/` update is needed.
