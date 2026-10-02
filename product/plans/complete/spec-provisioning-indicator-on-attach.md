# State in the tabs spec that a remote attach shows the provisioning indicator

**Complexity: 1/10** — a spec wording correction. No behavior change.

## Goal

The "Provisioning indicator" subsection of `product/specs/tabs.md` says tabs that never provision a workspace never show the indicator. An attach to a detached remote session clones nothing, yet shows "Provisioning workspace" until the host accepts: `settleResume` in `src/remote/resume.ts` writes the recorded workspace directory onto the channel only once the peer answers, so the remote workspace-absence test in `buildTabView` (`src/tab/view.ts`) holds through the handshake, and a reattached harness placeholder also carries `status: 'provisioning'` until its PTY registers. Make the spec say what the code does.

## Approach

Edit only that subsection: say that tabs with no workspace to provision never show the indicator, and that attaching a detached remote session shows it until the host accepts — the same state the metadata row's connection plug already reports as "Provisioning". Whether an attach should show a differently labelled indicator, or none, is a product decision left for a separate plan.

## Implementation steps

1. `product/specs/tabs.md` — in "Provisioning indicator", replace "Tabs that never provision a workspace never show it." with the attach sentence and the corrected closing sentence.

## Tests

None new: behavior is unchanged. The remote workspace-absence case in `src/tab/view.test.ts` ("reports it for a remote tab whose channel has no workspace yet, and drops it once one lands") already pins the state an attach passes through, and the harness placeholder case pins the harness half.

## Out of scope

- Changing the indicator's behavior or label during an attach.
- The connection plug's own "Provisioning" state.

## Verification

- `./scripts/run.mjs check-diff`
- Read the subsection back to confirm it carries user-visible behavior only, with no file paths or code.
