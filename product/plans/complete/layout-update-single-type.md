# Declare a profile layout update once, in the wire contract, and pass it through whole

**Complexity: 2/10** — a type-only consolidation across five files plus two relay bodies. No wire shape changes, no new behavior, and the compiler checks every site once the shared type exists.

The `sidebarLeft` / `sidebarRight` / `tabAreaPct` / `focusLeft` / `focusRight` record, with its `'files' | 'notifications'` union, is spelled out four times — the bus's `LayoutEvent` in `src/bus.ts`, the wire `LayoutEvent` in `src/protocol/events.ts`, the inline `sendLayout` parameter on `Sinks` in `src/controller/types.ts`, and `LayoutListener` in `web/src/ws.ts`. Two relays between them (`wireControllerEvents` in `src/controller/events.ts` and the `case 'layout'` arm of `JanusClient.onEvent` in `web/src/ws.ts`) re-list every field by hand, so a field added to the wire type and set by the profile code is silently dropped at whichever relay was not updated.

## Goal

One exported `LayoutUpdate` type in the wire contract. Every other declaration is that type plus its own discriminant, and both relays strip only the discriminant and pass the rest through unchanged, so a new field reaches the client without touching a relay.

## Approach

1. **`src/protocol/events.ts`**: export `LayoutUpdate` (the five optional fields) and define `LayoutEvent` as `{ t: 'layout' } & LayoutUpdate`. The existing comment stays on the wire event.
2. **`src/protocol.ts`**: add `LayoutUpdate` to the `./protocol/events.js` re-export list so the client reaches it through `@shared/protocol`.
3. **`src/bus.ts`**: import `LayoutUpdate` from `./protocol/events.js` (type-only) and define the bus `LayoutEvent` as `{ type: 'update' } & LayoutUpdate`.
4. **`src/controller/types.ts`**: `sendLayout?: (event: LayoutUpdate) => void`.
5. **`src/controller/events.ts`**: replace the field-by-field relay with a handler that destructures its parameter, `({ type: _type, ...update }) => sinks.sendLayout?.(update)`.
6. **`web/src/ws.ts`**: `export type LayoutListener = (event: LayoutUpdate) => void;` with `LayoutUpdate` imported from `@shared/protocol`, plus a module-level `layoutUpdateOf = ({ t: _t, ...update }: LayoutEvent): LayoutUpdate => update`; the `case 'layout'` arm hands every listener `layoutUpdateOf(event)`.

The emitters in `src/profile/layout.ts` and `src/profile/notifications.ts` already emit the bus shape and need no change. `src/index.ts` already spreads the sink argument into `{ t: 'layout', ...event }` and needs no change.

`eslint.config.mjs` configures `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: '^_'` only, so an `_`-prefixed rest sibling in a plain `const` destructure is an error. Both discriminants are therefore stripped by destructuring a function parameter, which the configured pattern already covers, rather than by loosening the rule or disabling it inline.

## Implementation steps

1. Add `LayoutUpdate` to `src/protocol/events.ts` and re-export it from `src/protocol.ts`.
2. Rewrite the bus event, the `Sinks.sendLayout` parameter, and the server relay; run `check-diff`.
3. Rewrite `LayoutListener` and the client relay; run `check-diff`.
4. Add the tests below; run `check-diff`.

## Tests

- `src/controller/events.test.ts`: a new case that a layout bus event carrying only some fields reaches `sendLayout` as exactly those fields — strict equality, no `type` key and no `undefined`-valued keys for fields the event did not carry.
- `web/src/ws.test.ts`: a new case that a `layout` wire event reaches a registered listener as its fields alone — strict equality, no `t` key.
- Existing coverage that must keep passing unchanged: `web/src/useLayoutState.test.tsx`, `web/src/ws.test.ts`, `src/profile/layout.test.ts`, `src/profile/notifications.test.ts`, and the existing `src/controller/events.test.ts` layout case.

## Spec

No user-visible behavior changes, so no spec text changes. `product/specs/profiles.md` describes the profile layout behavior and stays correct.

## Out of scope

- `useLayoutState`'s own `DockedView` alias and how it applies each field — the entry names that hook as the intended place to decide which fields are applied.
- The local `LayoutEvent` type in `web/src/useLayoutState.test.tsx`, which the entry requires to keep passing unchanged.
- The `reportLayout` RPC (client → server), which is a separate three-field shape.
