# Rearm shell status windows on activation and late rows

**Complexity: 4/10** — extend the existing shared window hook with the shell tab's activation and row-presence signals, and cover those transitions with the existing fake-timer and shell component tests.

**Goal.** A shell tab's connections and schedule windows auto-show when the tab becomes visible again or when rows arrive after the initial auto-show has ended.

**Approach.** Keep window visibility and timer state in `useStatusWindows`; pass it the shell tab's host-owned `active` state and whether each window has rows. Rearm on a tab activation or an empty-to-nonempty transition, while `StatusPanels` remains responsible for suppressing empty windows. Preserve the current identity-based behavior for callers that do not supply activation or content options.

## Implementation steps

1. Extend `useStatusWindows` to rearm on visible-tab activation and newly available rows, without changing `StatusPanels` empty-row behavior.
2. Pass the shell tab's active signal and row-presence state from `ShellTabMeta`; add hook timer tests and a shell-tab hide/reactivate regression.
3. Update `product/specs/shell-tab.md` with the visible auto-show behavior.
4. Run `./scripts/run.mjs check-diff` after each implementation step.

## Tests

- `web/src/shared/status-windows/useStatusWindows.test.ts`: a row becoming available after the prior timer expires starts a fresh auto-show; inactive windows rearm when their tab becomes active again; existing fade, hover, and pin cases keep passing.
- `web/src/plugins/shell/ShellTab.test.tsx`: hide and reactivate a shell tab after the original auto-show expires and verify its connection window appears again.
- Run the repository's diff-scoped check workflow.

## Out of scope

- Moving the empty-row rendering decision from `StatusPanels` into the hook.
- Changing auto-show timing, fade duration, hover behavior, or pin behavior.
