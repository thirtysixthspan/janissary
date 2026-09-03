# Drag tabs between split panes

**Complexity: 4/10**

## Goal

Let a user drag a tab label from either center split-pane strip and release it over the other strip to move that tab into the destination pane. Keep the existing within-strip live reorder, group constraint, Escape cancellation, and click-to-select behavior unchanged.

## Approach

Extend the existing tab reorder gesture with an optional named drop zone and cross-strip callback. A tab strip that opts into a drop zone marks its root element. When a drag ends over a different strip in the same zone, the hook calls the cross-strip callback instead of its normal reorder callback. The center action area pairs its left and right strips in one zone and maps the source strip index back to the full server tab index before sending the existing `moveTabToOtherPane` intent.

This keeps pane membership server-owned and reuses the same transition as each tab's Split button. Sidebar and reporting strips do not opt in, so dragging between those surfaces remains unsupported. The drop target is the destination strip rather than the pane body, which keeps the gesture attached to tab-strip navigation.

## Implementation steps

1. Update `web/src/useTabReorder.ts` and `web/src/TabStrip.tsx` to support an optional named cross-strip drop zone. A release over a sibling strip in that zone invokes the cross-strip callback and suppresses the source strip reorder commit.
2. Update `web/src/CenterActionArea.tsx` to pair the two center strips and send `moveTabToOtherPane` for the dragged tab's full server index. Add focused component tests for the reusable gesture and the pane-local to server-index mapping.
3. Update `product/specs/tabs.md` and `documentation/user-documentation/getting-started/tabs.md` so the documented split-pane drag behavior matches the UI.

Run `./scripts/run.mjs check-diff` after each implementation step.

## Tests

- `web/src/TabStrip.test.tsx`: releasing a drag over another strip in the same drop zone invokes the cross-strip callback once and does not invoke the reorder callback.
- `web/src/TabStrip.test.tsx`: a strip outside the named drop zone does not accept the cross-strip move, preserving the existing outside-release reorder behavior.
- `web/src/CenterActionArea.test.tsx`: dragging from one pane strip to the other sends `moveTabToOtherPane` with the dragged tab's full server index.

## Out of scope

- Changing the server pane transition, wire protocol, or split-collapse rules.
- Choosing a new within-pane order from the exact tab under the drop pointer. The existing global order determines where the moved tab appears in the destination strip.
- Dragging between center panes and sidebars or the reporting strip.
- Touch-specific drag support.
