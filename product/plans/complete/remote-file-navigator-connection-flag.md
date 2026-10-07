# Show remote connection status in the file navigator header

**Complexity: 4/10** — a small status projection through the existing tab view and a focused file navigator header update, with no connection lifecycle changes.

## Goal

A remote file navigator should show the shared connection plug after its branch in a flags group, reflecting the remote session's provisioning, connected, or reconnecting state. Local file navigators should not show it.

## Approach

Carry the remote connection's existing `reconnecting` and `provisioning` state onto the remote target inside the file navigator view. Render the shared `ConnectionPlug` after the branch, inside the same flags group used by shell tabs. Derive the plug state with provisioning taking precedence over reconnecting, matching the existing remote session control.

## Implementation steps

1. Extend the file navigator's remote view shape and `src/tab/view.ts` projection to include the current connection status from the existing remote manager lookups.
2. Update `web/src/file-navigator/FileNavigatorHeader.tsx` to render the shared connection plug after the branch for remote trees only.
3. Update the file navigator header and tab view tests for local omission, ordering, and the three remote states.

## Tests

- `src/tab/view.test.ts`: remote file navigator views carry reconnecting and provisioning status, while local views remain without a remote target.
- `web/src/file-navigator/FileNavigatorHeader.test.tsx`: local headers have no connection flag; remote headers place it after branch in `.tab-flags` and display active, reconnecting, and provisioning labels correctly.

## Specs and documentation

- Update `product/specs/file-navigator-tab.md` to describe the remote connection flag and its states.
- `help.md` and public documentation do not describe a remote connection flag in this header, so no user documentation change is needed.

## Out of scope

- Connection lifecycle, reconnect behavior, and attach/detach controls.
- The metadata layout of remote agent, harness, and shell tabs.
- Local file navigator headers.
