# Deliver the shell terminal row on its first host-state push

**Complexity: 3/10** — one tab-opening signal moves until after the already-existing PTY adoption, with one integration regression covering the host-state subscription.

**Goal.** A newly opened shell tab receives its `terminal:zsh` connection row on the first host-state delivery instead of appearing empty until another state mutation.

**Approach.** The plugin tab must exist before its spawned PTY can be adopted onto its label. Keep that sequence, but emit the state-dirty signal only after adoption so the host reads the completed tab/connection state on the first push.

## Implementation steps

1. Let plugin-tab activation apply the new tab, adopt every terminal created by its payload factory, and then publish the state change.
2. Add an integration regression in `src/plugins/host-state.test.ts` that opens a plugin tab with a terminal factory resource and checks that the first host-state slice includes `terminal:zsh`.
3. Update `product/specs/tab-plugins.md` and `product/specs/shell-tab.md` to describe the initial connection rows.
4. Run `./scripts/run.mjs check-diff` after each implementation step.

## Tests

- `src/plugins/host-state.test.ts`: open a shell-style plugin tab through `openPluginTab`; its first host-state delivery contains the adopted `zsh` terminal row.
- Preserve the terminal adoption and host-state fingerprint tests in `src/tab/manager.test.ts`, `src/controller.test.ts`, and `src/plugins/shell/activate.test.ts`.
- Run the repository's diff-scoped check workflow.

## Out of scope

- Changing which host-state slices plugins may request or how later connection changes are delivered.
- Changing PTY creation, ownership, or teardown behavior.
