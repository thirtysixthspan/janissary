# PR 1129 — the setup effect reads the selection layer through a ref

Complexity: 4/10

## Goal

`useXterm`'s setup effect is pinned to `[ptyId, client]` behind an eslint-disable and now
closes over the `selection` object returned by `useSelectionLayer`, so the custom key
handler, the registered `TerminalAccess`, and the resize observer all hold the object
built on the first render. They work only because `holds`/`text`/`clear` are stable
`useCallback`s; the first change that makes any of them depend on the layer's state
would pin the copy chord and the context menu to an empty selection silently.

## Approach

Keep a ref holding the current `SelectionLayerApi`, assigned every render beside the
existing `keyFilterRef.current = keyFilter` line — the pattern this file already uses for
exactly this reason. The three consumers inside the effect read `selectionRef.current`:
the `layerHeld` test and clipboard write in `attachCustomKeyEventHandler`, the
`hasSelection`/`getSelection` pair passed to `registerTerminalSelection`, and the
`clear()` in the `ResizeObserver`. The eslint-disable comment is extended to name the
selection ref. Behavior does not change.

## Implementation steps

1. `web/src/shared/terminal/useXterm.ts`: add `selectionRef`, assign per render, read it
   at the three consumer sites; extend the eslint-disable comment.
2. Test in `web/src/harness/HarnessTab.test.tsx`: a selection made after a re-render of
   the surface is still what the copy chord copies — the proof the indirection works
   rather than merely compiles.

Out of scope: any change of the selection object's shape or dependencies.
