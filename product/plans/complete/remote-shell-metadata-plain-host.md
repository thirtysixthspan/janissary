# Match remote shell metadata text and flags

**Complexity: 3/10** — a small shell-header presentation change with focused component tests and no protocol or runtime behavior changes.

## Goal

A remote shell's metadata row should show its host as ordinary text matching the working-directory text. Its connection plug should sit with the recording and workspace flags.

## Approach

Change only the bundled shell tab's metadata header. Replace its host chip with selectable cwd-style text while preserving the full-destination tooltip. Move the connection plug inside the existing flags group, beside the recording and workspace indicators. Keep agent and harness metadata unchanged.

## Implementation steps

1. Update `web/src/plugins/shell/ShellTabMeta.tsx` to render the host as ordinary text and place the connection plug in the flag group.
2. Update `web/src/plugins/shell/ShellTabMeta.test.tsx` to cover the plain-text host, preserved tooltip, flag-group placement, and local-shell behavior.

## Tests

- `web/src/plugins/shell/ShellTabMeta.test.tsx`: assert the host is no longer a chip, matches cwd text styling, retains the remote destination tooltip, and the connection plug is grouped with the recording/workspace flags only for remote shells.

## Specs and documentation

- Update `product/specs/shell-tab.md` to describe the remote shell host text and connection plug placement.
- Update `product/specs/tabs.md` to distinguish remote shell host text from the agent and harness host chips.
- Update `documentation/user-documentation/getting-started/tabs.md` to clarify the remote shell row while preserving the separate agent and harness chip behavior.
- `help.md` and the remote agents page describe command and agent/harness behavior, not the remote shell metadata layout, so they need no change.

## Out of scope

- Remote agent and harness metadata rows.
- Connection status meaning, detach/attach behavior, and host tooltip content.
- Local shell metadata.
