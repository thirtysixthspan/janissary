# Make the client tab view a discriminated union

**Complexity: 6/10** — ~140 added lines across four production files plus test-helper assertions, 9 requirements and 12 scenarios (p=5.968); a type-level refactor with no new architecture.

## Goal

`TabView` declares `view?` alongside five independent optional payload fields whose "present only for this view" invariant lives in comments, so the client mirror in `web/src/shared/tab/view-guards.ts` hand-writes five predicates and five `TabView & { view; payload: NonNullable<...> }` types to recover what the type system does not say. A payload under the wrong view, or a guard updated on one side only, renders an empty body or throws in a component with no compile-time signal. Make `TabView` a union of one member per view kind, have `buildTabView` produce the narrow member, and derive the client's narrowed view types from the union with `Extract` so there is one definition of each view's payload.

## Approach

In `src/protocol/tab.ts`, factor the shared presentation fields (including the payload fields as optional) into an exported `TabViewBase`, extract the monitor payload's inline shape into an exported `MonitorView`, and redefine `TabView` as a union of seven members: six with a required literal `view` (`plugin`, `harness`, `editor`, `monitor`, `files`, `notifications`) and one plain member with `view?: undefined`. Each payload member intersects the base with a required payload keyed to its discriminant, so narrowing on `view` yields a non-optional payload. The base keeps the payload fields optional so the many call sites that read `tab.plugin?.…` or `tab.harness?.…` on an unnarrowed `TabView` keep compiling; the union members tighten the matching one. `src/protocol.ts` already re-exports `TabView`, and re-exports `TabViewBase` and `MonitorView` for completeness.

In `src/tab/view.ts`, build the shared fields once into a `TabViewBase` value with the five payloads computed into locals, then switch on `tab.view` to return the narrow member: for each payload kind, return the base spread with that view and the non-null payload, or the plain base when the payload is absent (a malformed tab renders nothing, as the guards do today); `notifications` returns the base with its view; the default returns the plain base. This keeps the wire output byte-for-byte identical for well-formed tabs while giving the return a narrow type. `buildManagedTabView`'s spread to add `agentRun` already type-checks against the union.

In `web/src/shared/tab/view-guards.ts`, replace the five hand-mirrored `TabView & …` type aliases with `Extract<TabView, { view: <kind> }>` and keep the five thin runtime guards and `indexedTabs` unchanged — their narrowing now comes from the union rather than a mirrored type. A payload-less tab of a given view still fails its guard at runtime, so `view-guards.test.ts` and `App.test.tsx` keep their behavior contract.

Because `Partial<TabView>` now distributes over the union, the test-only `makeTab`/`tab` helpers that spread `Partial<TabView>` over a literal need a final `as TabView` assertion on their returned object; no runtime behavior changes.

## Implementation

1. In `src/protocol/tab.ts`, add `MonitorView`, replace the current `TabView` object type with `TabViewBase` plus the seven-member `TabView` union, preserving every field comment on the base and the payload-member comments on the members. Re-export `TabViewBase` and `MonitorView` from `src/protocol.ts`.
2. In `src/tab/view.ts`, lift the five payload expressions out of `buildTabView`'s returned literal into locals, assemble the remaining shared fields into a `TabViewBase` value, and return the narrow member from a `switch (tab.view)`. Keep `buildManagedTabView` unchanged.
3. In `web/src/shared/tab/view-guards.ts`, change the five narrowed type aliases to `Extract<TabView, { view: … }>`; leave the guard bodies and `indexedTabs` as they are.
4. Add `as TabView` to the returned object in each `Partial<TabView>`-based test helper that TypeScript flags, and set the `view` on any `buildTabView` test tab that relies on a payload being projected but omits the discriminant.
5. Run `$janissary/scripts/run.mjs check-diff` after each step and fix all failures before continuing.

## Tests

- `web/src/shared/tab/view-guards.test.ts` and `web/src/App.test.tsx` keep passing unchanged as the guard behavior contract.
- `src/tab/view.test.ts` gains cases asserting `buildTabView` returns a narrow member: a `view: 'harness'` tab's view narrows on `view` and carries `harness`, a payload-less `view: 'harness'` tab has no `view` on the wire (degrades to no body), and a plain tab carries neither `view` nor any payload. Existing cases keep passing.
- All existing suites, including the `Partial<TabView>` helper suites, keep passing after the assertion updates.

## Out of scope

- `src/tab/types.ts` (`Tab`) and `src/tab/view-guards.ts` (server guards), which still carry optional payloads and their own guards until a later change.
- Any runtime behavior change for well-formed tabs; this is a type-level refactor.
- Removing the five client guards or `indexedTabs`; they remain as thin runtime-narrowing helpers.

## Documentation and specification impact

None. No flag, command, key binding, or user-visible behavior changes, so no spec, `help/` or `documentation/user-documentation/` update is needed.
