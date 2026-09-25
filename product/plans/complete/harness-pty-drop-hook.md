# Move the harness tab's drag-into-terminal PTY write into a hook

**Complexity: 2/10** — one new hook file beside the component, one effect in `HarnessTab.tsx` reduced to a single call, and a colocated hook test. No wire-protocol change, no registry signature change, and nothing a user can observe changes.

`web/src/harness/HarnessTab.tsx` registers its file-navigator drop handle in a component-body `useEffect`. The effect's `insertAtCaret` focuses the terminal and sends the `ptyInput` RPC, so the harness side of the navigator-into-harness drop contract (publish under the PTY id, focus, write, tear down) lives inside the component. That is against §5 of `ai/guidelines/react-code-organization.md` (components render; they do not decide), and the only way to exercise it today is to render `HarnessTab` with the xterm layer mocked.

## Goal

The drop contract's harness half is a named hook, `useHarnessPtyDrop`, that a test can drive through `renderHook` without the tab's markup. `HarnessTab` calls it once and keeps rendering the `data-harness-drop` marker exactly as it does now.

## Design decisions

**A hook, not a plain function.** The logic owns an effect lifecycle (publish on mount or PTY change, remove on unmount), so per §6 it is a hook and carries the `use` prefix.

**The hook takes `(ptyId, client, focus)`.** Those are exactly the three values the effect closes over today, and exactly its dependency list. Passing the component's `focusTerm` keeps the hook ignorant of xterm, and passing the `JanusClient` keeps it free of any service construction (§7).

**Colocated in `web/src/harness/`.** It has one consumer, `HarnessTab`, so it stays beside it (§2). `web/src/harness-drop-registry.ts` and `registerHarnessDrop` are unchanged; the navigator's `useFileNavigatorDrag` consumes the registry, not the component, so it is unaffected.

**The `data-harness-drop` marker stays in the component.** It is markup, and the component already derives it from the same `ptyId`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The drop registry (unchanged) | `web/src/harness-drop-registry.ts` |
| The handle type | `HarnessDropHandle` in `web/src/shared/drop-handles.ts` |
| The render-level drop-target cases (must pass unchanged) | `web/src/harness/HarnessTab.test.tsx`, `describe('as a file-navigator drop target')` |
| `renderHook` hook-test style | `web/src/useLatestRef.test.ts` |

## Implementation steps

1. **New hook `web/src/harness/useHarnessPtyDrop.ts`.** Export `useHarnessPtyDrop(ptyId: string, client: JanusClient, focus: () => void): void`, holding the effect moved verbatim from `HarnessTab.tsx`: return early when `ptyId` is empty, otherwise return `registerHarnessDrop(ptyId, { insertAtCaret })` where `insertAtCaret` calls `focus()` and then `client.send({ method: 'ptyInput', params: { id: ptyId, data: text } })`. Dependencies `[ptyId, client, focus]`. Move the explanatory comment with it.

2. **`web/src/harness/HarnessTab.tsx`.** Replace the effect with `useHarnessPtyDrop(ptyId, client, focusTerm)`, drop the `registerHarnessDrop` import and `useEffect` from the React import.

## Tests

- New `web/src/harness/useHarnessPtyDrop.test.ts`:
  - registers a handle under the PTY id while mounted;
  - `insertAtCaret` focuses first and then sends `ptyInput` with the PTY id and the dropped text;
  - unmounting removes the handle;
  - an empty PTY id registers nothing;
  - a PTY id change moves the handle from the old id to the new one.
- `web/src/harness/HarnessTab.test.tsx` must pass **unchanged**.

## Out of scope

- Changing `registerHarnessDrop`'s signature or the registry's module location.
- Generalizing the three-file drop contract so the next drop consumer cannot wire `insertAtCaret` by hand.
- Any change to `web/src/file-navigator/useFileNavigatorDrag.ts`.
