# Give the plugin client capability factory named options

**Complexity: 5/10** — one exported factory, its production caller, and its colocated test file change. The options type pushes the published API module over its 200-line limit, so the factory implementation also moves into a focused module while remaining exported from the same public API. The argument shape is compile-time-only; capability values and runtime behavior remain unchanged.

## Goal

Replace the thirteen positional parameters of `createPluginClientCapabilities` with a single named options object so callers identify each capability input and cannot silently transpose adjacent optional strings.

## Design decisions

Export `PluginClientCapabilityOptions` beside `TabPluginClientCapabilities` in `web/src/plugins/api.ts`. The required fields are `host`, `pluginId`, `label`, `client`, `active`, `dock`, and `onClose`. The optional fields are `splitAction`, `onDirtyHandle`, `claimedChords`, `dotColor`, `recording`, `transcript`, and `remoteCapabilities`.

Keep `claimedChords` defaulting to an empty list inside the factory. Leave recording and transcript paths paired with their openers only when their respective path is defined. Keep failure reporting deduplicated once per plugin. The factory will destructure the named object and otherwise retain its existing capability construction.

## Implementation steps

1. Add and export the options type beside `TabPluginClientCapabilities` in `web/src/plugins/api.ts`.
2. Move the factory implementation and its implementation-only imports to `web/src/plugins/plugin-client-capabilities.ts`, with the function accepting and destructuring the named options object. Re-export it from `api.ts` to preserve the public entry point.
3. Update the `useMemo` in `web/src/plugins/PluginBody.tsx` to pass the same values by their named fields.
4. Convert every call in `web/src/plugins/api.test.ts` to the options object without changing assertions.
5. Remove only this selected item from the ready section of `product/backlog/technical-debt.md`.

## Tests

The existing `web/src/plugins/api.test.ts` cases cover each field the factory returns, including optional recording/transcript behavior and one-report-per-plugin failure deduplication. Convert their calls without changing assertions; the compiler verifies the production and test call sites use the new shape. Run `./scripts/run.mjs check-diff` after the implementation.

## Specs and documentation

No spec update is needed: this changes only the TypeScript call shape and does not alter observable plugin behavior. No help or public documentation describes this internal factory signature, so no documentation update is needed.

## Out of scope

- Changing any capability's runtime behavior, defaults, or returned shape.
- Editing other technical-debt entries or resolving another item.
- Changing plugin documentation, API versions, or user-facing documentation.
