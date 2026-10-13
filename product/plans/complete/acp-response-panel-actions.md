# ACP Response Panel Actions

**Complexity: 6/10** — a localized client-side extraction with a framework-free transport adapter, a hook, and focused tests. It preserves the panel's public props and existing behavior.

## Goal

Keep tab-scoped protocol routing and transport construction out of the shared ACP response panel component, while ensuring actions from a docked panel continue to target its owning tab.

## Approach

Add a framework-free adapter in `web/src/shared/acp/acp-panel-actions.ts` that receives a narrow send/PTY-attachment port and the owning tab label. It returns reset and collapse actions, transcript intents with only command calls scoped to that label, and the PTY actions used by the transcript. Add `useAcpPanelActions` to bind the adapter to the current client and label. Keep the component's public props unchanged and leave its markup, keyboard forwarding, refs, and focus restoration in place.

## Implementation steps

1. Extract ACP panel action and transport construction into the adapter and hook, then update the panel to consume the hook.
2. Add direct adapter tests for reset, collapse, command retargeting, unchanged non-command calls, and PTY transport behavior; add a hook rerender test for owner-label changes.
3. Preserve the existing response-scope tests for reset, question routing, keyboard collapse, and focus.
4. Update `product/specs/acp.md` to state that response-panel actions remain scoped to the owning tab.
5. Check `help.md` and `documentation/user-documentation/` for descriptions affected by this change.

## Tests

- Direct adapter tests cover reset/collapse RPCs, command-only tab binding, untouched non-command parameters, and PTY attachment/action delegation.
- Hook tests rerender with a different label and confirm actions use the current owner.
- Existing `AcpResponseScope.test.tsx` continues to cover docked reset, question routing, Ctrl+T collapse, and focus restoration.

## Out of scope

- Changing the ACP response surface's public props or plugin API.
- Changing server protocol behavior or user-visible ACP behavior.
- Refactoring transcript rendering, question routing, or focus behavior beyond preserving current behavior.
