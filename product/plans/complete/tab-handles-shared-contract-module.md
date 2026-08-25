# Declare the three imperative focus handles in a shared contract module

**Complexity: 2/10** — three one-method type aliases move into a new module beside the two contract modules that already exist for exactly this reason. Nine production files and six tests repoint a type-only import; every reference is type-only, so nothing changes at runtime.

## Goal

Three components each declare the imperative handle they expose through `forwardRef`:

- `web/src/HarnessTab.tsx:13` — `HarnessTabHandle = { focus(): void }`
- `web/src/ShellTab.tsx:9` — `ShellTabHandle = { focus(): void }`, identical
- `web/src/QuestionPanel.tsx:7` — `QuestionPanelHandle = { focusCancel(): void }`

The two focus hooks reach up into all three component files for them — `web/src/useTabHandles.ts:2-4` and `web/src/useFocusOnTabSwitch.ts:4-6` — and `useFocusOnTabSwitch.test.ts:4-6` copies the same reach. A hook importing a component is §8 of [`react-code-organization.md`](../../../ai/guidelines/react-code-organization.md): each layer imports downward only.

These are one-method contracts, not components. The cost is that `focusCenterVisibleTab` — a plain function over two ref maps — cannot be typed or tested without the harness tab, the shell tab, and the question dialog in its module graph, and the next focusable surface will add a fourth such upward import rather than a line to a contract file.

## Approach

Create `web/src/tab-handles.ts` holding all three aliases, beside the two modules that already are this fix: `drop-handles.ts` (the file-navigator drop contracts) and `status-button.ts` (`StatusWindowButtonProps`). `drop-handles.ts` sets the shape to follow — a leading comment saying what the file is for, then one commented alias per contract, no imports, no runtime code.

The three belong in one module rather than three: they are the same kind of thing (an imperative focus escape hatch published through a ref), they have the same two consumers, and the point of the change is that a future focusable surface adds a line here instead of a fourth upward import.

`HarnessTabHandle` and `ShellTabHandle` have structurally identical bodies but stay two named aliases, not one shared `FocusHandle`. They are contracts published by two unrelated components, and `useFocusOnTabSwitch` keys two separate ref maps by them; collapsing them would couple the two components' contracts so that giving one a second method silently widens the other. The comments in the new module say which surface publishes each.

The three components keep their declarations' place in the file — each now imports its own handle type from `./tab-handles` for the `forwardRef` type argument. Nothing is re-exported from the old homes, per §2 and [`imports-and-barrel-files.md`](../../../ai/guidelines/imports-and-barrel-files.md), so all fifteen consumers import from `tab-handles.ts` directly. Five of those sites currently combine the value and type in one statement (`import { ShellTab, type ShellTabHandle } from './ShellTab'`) and split into two: the component from its file, the type from the contract module.

## Implementation steps

1. Create `web/src/tab-handles.ts` with a leading comment in the style of `drop-handles.ts`, holding `HarnessTabHandle`, `ShellTabHandle`, and `QuestionPanelHandle`, each with a one-line comment naming the surface that publishes it and what the method does. No imports.
2. `web/src/HarnessTab.tsx`, `web/src/ShellTab.tsx`, `web/src/QuestionPanel.tsx` — delete the local declaration; import the type from `./tab-handles` for the `forwardRef` type argument.
3. `web/src/useTabHandles.ts` and `web/src/useFocusOnTabSwitch.ts` — replace their three component imports with one `import type { HarnessTabHandle, ShellTabHandle, QuestionPanelHandle } from './tab-handles';`.
4. `web/src/AppMain.tsx` — same three-into-one replacement.
5. `web/src/HarnessTabLayer.tsx`, `web/src/ShellTabLayer.tsx`, `web/src/MountedViewLayers.tsx` — split the combined value+type imports so the component still comes from its own file and the handle type comes from `./tab-handles`.
6. Repoint the six tests the same way: `useFocusOnTabSwitch.test.ts`, `MountedViewLayers.test.tsx`, `MountedViewLayers.video-playback.test.tsx`, `ShellTabLayer.test.tsx`, and — splitting a combined import — `ShellTab.test.tsx` and `QuestionPanel.test.tsx`.

Relative imports in `web/src/` stay extensionless.

## Tests

`web/src/tab-handles.test.ts` (new) — modeled directly on `drop-handles.test.ts`, which pins the type-only drop contracts the same way. The contracts have no runtime behavior of their own, so each case constructs a value of the contract type from `vi.fn()` members and calls them, which fails to compile if a member is renamed, dropped, or given a different signature:

- `HarnessTabHandle` accepts a `focus()` implementation and invokes it.
- `ShellTabHandle` accepts a `focus()` implementation and invokes it.
- `QuestionPanelHandle` accepts a `focusCancel()` implementation and invokes it.

The six existing tests that reference these types keep every case unchanged — only their import lines move. `useFocusOnTabSwitch.test.ts` in particular still covers the real focus routing (harness tab, shell tab, question panel cancel), and it now does so without three component modules in its graph, which is the point of the move.

## Out of scope

- Merging `HarnessTabHandle` and `ShellTabHandle` into one shared focus contract.
- The `forwardRef` usage in the three components, and anything about how or when focus is actually moved.
- `dropRef`/`recallRef` and the contracts already in `drop-handles.ts`.
- Moving `HarnessTab.tsx`, `ShellTab.tsx`, or `QuestionPanel.tsx` into feature directories.

## Documentation

None. All three names are internal to the web client and every reference is a type-only import, so no user-visible behavior changes and nothing `help.md`, the functional specs, or `documentation/user-documentation/` describes is now different.
