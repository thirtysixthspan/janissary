# Move the status-window modules into the shared layer

## Complexity

4/10 — a mechanical directory move of eight files plus import-specifier rewrites in eight source importers and one test file; no behavior change, and every moved test keeps its own relative specifiers.

## Goal

`web/src/status-button.ts`, `web/src/useStatusWindows.ts`, `web/src/StatusPanels.tsx`, and `web/src/StatusWindowButton.tsx` sit at the app root but are imported by the harness, editor, and agent-tabs features and by `shared/AgentTabMeta.tsx` — a feature-and-shared reach upward into the app shell, against the one-way dependency flow (shared → feature → app). Move the four modules (and their colocated tests) into `web/src/shared/status-windows/`.

## Approach

Create `web/src/shared/status-windows/` and move eight files into it unchanged: `status-button.ts` + `status-button.test.ts`, `useStatusWindows.ts` + `useStatusWindows.test.ts`, `StatusPanels.tsx` + `StatusPanels.test.tsx`, `StatusWindowButton.tsx` + `StatusWindowButton.test.tsx`.

- The moved modules' interdependencies are all within the set (`status-button.ts` imports `useStatusWindows`; `StatusPanels.tsx` imports `useStatusWindows`), so those `./` specifiers stay.
- `StatusPanels.tsx` imports `./icons`, which becomes `../../icons`.
- Eight non-test importers retarget at `shared/status-windows/`:
  - `web/src/harness/HarnessTabLayer.tsx`: `../StatusPanels` → `../shared/status-windows/StatusPanels`, `../useStatusWindows` → `../shared/status-windows/useStatusWindows`, `../status-button` → `../shared/status-windows/status-button`
  - `web/src/harness/HarnessTab.tsx`: `../status-button` → `../shared/status-windows/status-button`
  - `web/src/editor/useEditorConnections.ts`: `../status-button` and `../useStatusWindows` → the same under `../shared/status-windows/`
  - `web/src/editor/EditorMetaRow.tsx`: `../StatusWindowButton` and `../status-button` → the same
  - `web/src/editor/EditorConnectionsPanel.tsx`: `../StatusPanels` → `../shared/status-windows/StatusPanels`
  - `web/src/agent-tabs/AgentTabBody.tsx` and `web/src/agent-tabs/InactiveAgentTabBody.tsx`: `../StatusPanels`, `../useStatusWindows`, `../status-button` → the same under `../shared/status-windows/`
  - `web/src/shared/AgentTabMeta.tsx`: `../StatusWindowButton` and `../status-button` → `./status-windows/StatusWindowButton` and `./status-windows/status-button`
- One further test file, `web/src/editor/useEditorConnections.test.ts`, imports `StatusWindowButtonProps` from `../status-button` and retargets to `../shared/status-windows/status-button`.

## Implementation

1. `mkdir web/src/shared/status-windows` and `git mv` the eight files into it.
2. Fix `StatusPanels.tsx`'s `./icons` import to `../../icons`.
3. Retarget the eight source importers and the one test file.
4. Run `./scripts/run.mjs check-diff` after the move and again after the rewrites.

## Tests

No new tests — a pure move. The four moved suites keep passing with their own relative specifiers intact; the consumer suites (`useEditorConnections.test.ts` and whatever renders the moved components) stay green with retargeted imports.

## Out of scope

- Adding ESLint `import/no-restricted-paths` zones to make the boundary mechanical.
- Any behavior change to the moved modules.
