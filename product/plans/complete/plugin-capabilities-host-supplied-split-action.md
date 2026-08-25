# Move the plugin capability contract off the host component it constructs

**Complexity: 3/10** — one parameter changes from a callback to an already-built node, one `React.createElement` moves up a layer into the component that already renders around it, and the contract's two React references become a type-only import. Three files change, no exported type changes, and nothing a user can observe changes.

`web/src/plugins/api.ts` defines `TabPluginClientCapabilities` — the contract twenty-two plugin files depend on — and builds every plugin's capability object. It also imports React and `SplitTabButton` from `../SplitTabButton`, and line 68 fills the `splitAction` field with `React.createElement(SplitTabButton, { onClick: onSplit })`.

That is a service importing a component: §7 (services are framework-free; they never import React or component modules) and §8 (a service importing a component inverts the layer order). The cost is that the plugin contract cannot be unit-tested or reused without React and one specific host button, and the next host-rendered control added to the contract gets welded in the same way.

## Goal

`createPluginClientCapabilities` builds no markup. `splitAction` arrives as an already-built node from the component layer, and `api.ts` keeps only a type-only `ReactNode` import — no runtime React, no component import.

## Design decisions

**The caller supplies the node, not a component reference.** Passing `SplitTabButton` itself into `api.ts` would leave the same inversion with an extra hop. The host builds the element and hands it over, which is what makes `splitAction` genuinely "whatever the host chose to render here" — the shape the contract already promises plugins.

**`splitAction` replaces `onSplit` in the same position.** The seventh parameter goes from `onSplit?: () => void` to `splitAction?: ReactNode`, so the call sites keep their shape and no other argument moves. `?? null` preserves today's "null when the host offers no split", which the plugin bodies branch on (`MarkdownTab` renders its actions wrapper only when the node is non-null).

**`import type { ReactNode } from 'react'`, not `import React`.** The exported contract must keep saying `splitAction` is a React node — `React.ReactNode` and `ReactNode` are the same type, so plugins are untouched — but a type-only import is erased at transpile and carries no runtime dependency on React. That is the distinction §7 is about: the contract may *describe* a node it never *builds*.

**`PluginBody` builds it, memoized on the same two values the old branch used.** `PluginBody` already computes a stable `split` callback (through a ref, so the layer rebuilding `onSplit` every render does not churn the capability object) and a `splittable` flag. Wrapping `<SplitTabButton onClick={split} />` in a `useMemo` on those two keeps the node's identity stable, which is what keeps the memoized capability object stable underneath a mounted plugin. `PluginBody`'s own props are unchanged, so `PluginTabLayer` and everything above it are untouched.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The button being constructed | `web/src/SplitTabButton.tsx` |
| The stable `split` callback and `splittable` flag | `web/src/plugins/PluginBody.tsx:136`–`:139` |
| The memo that must stay stable across renders | `web/src/plugins/PluginBody.tsx:152`–`:157` |
| End-to-end coverage of the split button reaching the current handler | `web/src/plugins/PluginTabLayer.test.tsx:174`, `:220` |
| Plugin bodies that render the node (unchanged) | `VideoTab`, `ImageTab`, `PageTab`, `AudioTab`, `MarkdownTab`, `SchedulesTab` |

## Implementation steps

1. **`web/src/plugins/api.ts`.** Drop `import React from 'react'` and `import { SplitTabButton } from '../SplitTabButton'`; add `import type { ReactNode } from 'react'`. Change the contract's field to `splitAction: ReactNode`. Change the seventh parameter of `createPluginClientCapabilities` from `onSplit?: () => void` to `splitAction?: ReactNode`, and the returned field to `splitAction: splitAction ?? null`.

2. **`web/src/plugins/PluginBody.tsx`.** Import `SplitTabButton`. Add a `useMemo` returning `splittable ? <SplitTabButton onClick={split} /> : null`, keyed on `[split, splittable]`, and pass it into `createPluginClientCapabilities` in place of `splittable ? split : undefined`, updating that memo's dependency list accordingly.

## Tests

- `web/src/plugins/api.test.ts` — replace the split case with two that pin the contract as framework-free: the node the host passed comes back on `splitAction` unchanged (a plain sentinel string, no React involved), and `splitAction` is `null` when the host passes nothing. The file continues to import no React.
- `web/src/plugins/PluginTabLayer.test.tsx` must pass **unchanged** — it already renders a plugin that mounts `capabilities.splitAction`, asserts `split:null` when the host offers no split, and clicks the rendered `Split` button to check it reaches the host's *current* handler across a rerender. That is the check that the element moved without changing behavior or losing memo stability.

## Out of scope

- **Changing `PluginBody`'s or `PluginTabLayer`'s props.** `onSplit` remains the host-facing prop; only what `PluginBody` hands to the capability factory changes.
- **Moving any other capability out of `api.ts`.** `close`, `intent`, `resourceUrl`, `reportFailure`, and `registerDirtyHandle` are already framework-free.
- **Adding further host-rendered controls to the contract.** This change is what makes the next one cheap; it does not add one.
- **The plugin API version or deprecation window.** The exported type is unchanged, so no plugin sees a different contract.
- **Moving `SplitTabButton` into a shared directory.** Where that component lives is a separate question from who constructs it.
