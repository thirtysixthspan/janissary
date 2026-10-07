# Move the harness connection icon into the flags group

## Complexity

2/10 — a small metadata-row placement change, a focused regression test, and a spec clarification.

## Goal

In a remote harness tab, show the connected icon in the flags group after the working directory, with the other flags. Preserve the existing placement for remote agent tabs.

## Approach

- Add a metadata-row option that places the remote connection plug inside the flags group.
- Enable that option only for `HarnessTab` and keep the plug ahead of the harness's other flags.
- Restrict the leading-row CSS order rule to a plug that is a direct child of the metadata row.

## Implementation steps

1. Update `AgentTabMeta` and `HarnessTab` to place the harness connection plug in the flags group while retaining the existing remote-agent layout.
2. Update the metadata-row CSS and add a regression test for the remote harness layout.

## Tests

- `HarnessTab.test.tsx`: a remote harness's connection plug is in `.tab-flags` after `.tab-cwd` and before the other flags.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Spec

- `product/specs/tabs.md`: specify the connection plug placement for remote harness tabs.

## Out of scope

- Changing connection icon placement for remote agent or shell tabs.
- Public documentation changes; this is a layout adjustment not otherwise described there.
