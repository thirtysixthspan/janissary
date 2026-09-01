# Let the controller inherit its adapter method signatures by declaration merging

Complexity: 2/10

## Goal

Remove the fifty-six hand-written `declare <method>: <Adapter>['<method>'];` lines from `src/controller.ts` and let the class type acquire those members from the five adapter types directly, so a method added to an adapter no longer needs a mirroring line on the controller.

## Approach

Declare an interface with the same name as the class beside it — `export interface Controller extends TabControllerAdapter, MonitorControllerAdapter, EditorControllerAdapter, FileNavigatorControllerAdapter, PluginControllerAdapter {}` — so TypeScript merges those members into the `Controller` type without obliging the class body to define them. The `Object.assign` in the constructor remains the only thing that supplies the implementations, exactly as today.

Drop the `implements` clause: with the members supplied by the merged interface, `implements` is satisfied trivially and adds nothing, and keeping it would restate the same five names a third time.

## Implementation steps

1. Confirm no member name across the five adapter types collides with a method or accessor the class defines itself (`rootDir`, `rehydrate`, `view`, `routeView`, `stateEvent`, `chooseRoute`, `harnessLaunchView`, `closeHarnessLaunch`, `scheduleLaunchView`, `closeScheduleLaunch`, `answerQuestion`, `dispatch`, `openFilePath`, `openTranscriptFor`, `openHarnessTranscriptFor`, `openAcpTranscript`, `reportLayout`, `complete`, `shutdown`, `managers`). A collision would silently bypass the cross-check `implements` performs today.
2. In `src/controller.ts`, add the declaration-merged `export interface Controller` above the class.
3. Delete the fifty-six `declare` lines and the `implements` clause from the class.
4. Leave the constructor untouched — `createManagers` first, `Object.assign` of the five factories next, `managers.schedule.start()` last.
5. `@typescript-eslint/no-unsafe-declaration-merging` rejects the class/interface pair, since a merged member need not be implemented. That is the same gap the item's own proposal risk names and the runtime test below covers, so silence it with two targeted `eslint-disable-next-line` comments in the repo's `-- <reason>` style rather than by relaxing the rule for the whole project.

## Tests

- `src/controller.test.ts` already exercises the delegated methods through the controller; it must keep passing unchanged.
- `src/message-handler-exhaustive.test.ts` walks every client RPC method through the dispatcher; a member lost in the conversion fails there.
- Add a case to `src/controller.test.ts` asserting that every method name declared by the five adapter types is a callable function on a constructed controller, so a factory dropped from the `Object.assign` — which the merged interface no longer catches at build time — fails a test instead of surfacing as a runtime `TypeError` in the RPC dispatcher.
- Run `./scripts/run.mjs check-diff` after each step.

## Specs and documentation

No user-visible behavior changes. No spec, `help.md`, or `documentation/user-documentation/` updates expected.

## Out of scope

- Changing any adapter type or factory.
- Changing the constructor's ordering or the `Object.assign` composition itself.
- Making the assignment statically verifiable (the merged interface is a type-level change only).
