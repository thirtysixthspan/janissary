# Clipboard history in plugin tabs

**Complexity: 3/10** — the clipboard overlay and paste routing already exist. The missing piece is rendering the host-provided overlay in the current plugin tab and pinning that a shell command bar receives the paste.

## Goal

The clipboard-history popup opens over the current shell tab, and choosing an entry pastes it into the shell command bar at its caret without running it.

## Approach

Pass the existing contributed overlay into the current shell plugin tab's host frame, alongside the tab navigator already rendered there. Keep the overlay host-owned and reuse its existing focus-origin and paste routing. Other plugin tabs remain unchanged because they do not provide the shell's command-bar paste target.

## Implementation steps

1. In `web/src/MountedViewLayers.tsx`, include `contributedOverlay` in the host-rendered overlay content passed to the current shell plugin tab's `PluginTabLayer`.
2. Add a `MountedViewLayers` regression proving the contributed overlay renders inside the current plugin tab and not an inactive plugin tab.
3. Add clipboard paste-routing coverage for a focused shell command-bar textarea with no agent drop handle; selecting an entry must route it through ordinary text-field insertion and restore focus.
4. Update `product/specs/clipboard-history.md` to include the shell plugin tab as an overlay surface and paste target.

## Tests

- `web/src/MountedViewLayers.test.tsx`: the contributed overlay renders only inside the current shell plugin tab.
- `web/src/overlay-plugins/clipboard-history/paste-routing.test.tsx`: a shell command bar receives the chosen text at its caret and retains focus, without submitting the line.
- Existing clipboard-history, paste-routing, and `PluginTabLayer` tests continue to pass.

## Out of scope

- Changing clipboard recording, entry order, keyboard bindings, or paste routing for other surfaces.
- Rendering contributed overlays in non-shell or docked plugin tabs.
- Updating public documentation or `help.md`, which do not restrict the popup to specific tab kinds.
