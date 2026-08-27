# Add a file-navigator intent boundary

**Complexity: 7/10** — the change introduces one hook-owned protocol adapter, rewires three components, and updates focused component coverage while preserving the existing wire messages.

## Goal

Keep file-navigator components focused on rendering and event wiring by adapting `JanusClient` protocol calls into intention-revealing callbacks in a feature hook.

## Approach

Add `useFileNavigatorIntents` as the reactive seam between the client service and the feature view. The hook returns stable callbacks for toggle, edit, reroot, command execution, dock/detail changes, collapse, and GitHub opening. `FileNavigatorTab` consumes the hook and passes only narrow callbacks to its header and GitHub button.

## Implementation steps

1. Add `web/src/file-navigator/useFileNavigatorIntents.ts` with stable callbacks that preserve the existing protocol messages and parameters.
2. Replace direct `client.send` calls in `FileNavigatorTab` with the hook's intent callbacks.
3. Change `FileNavigatorHeader` and `FileNavigatorGithubButton` to receive action callbacks instead of `JanusClient`, with `FileNavigatorTab` supplying callbacks for the current dock, detail mode, and GitHub URL.
4. Extract the file-row list into a colocated `FileNavigatorRows` component so the rewired tab remains within the 200-line file limit without compacting its orchestration.

## Tests

- Add focused hook tests covering the file-navigator-specific messages and generic command/open actions.
- Update the GitHub button test to assert its callback contract.
- Run the existing `FileNavigatorTab` tests through `./scripts/run.mjs check-diff` to confirm rendered actions still emit the same protocol messages.

## Specs

- No functional spec change is needed because the UI actions and protocol behavior remain unchanged.

## Out of scope

- Reworking the existing operation hooks that already own their client interactions.
- Changing file-navigator commands, labels, keyboard behavior, or wire contracts.
- Moving shared UI primitives or client types.
