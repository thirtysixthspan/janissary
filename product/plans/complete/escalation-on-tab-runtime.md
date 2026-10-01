# Hold the pending idle escalation on the harness tab's runtime record

**Complexity: 5/10** — the escalation module's storage moves from a module-level `Map<label, Timeout>` to a field on the tab's existing `runtime` sub-record, which changes the cancel and dispose signatures to take `Managers` and touches the three test suites that drive them. No behavior changes. The care needed is that the runtime sub-record must never reach a serializer, and that every lookup goes through the live tab rather than a captured copy.

`src/harness/idle-notification.ts` keeps each harness tab's pending escalation timer in a new module-level `Map<string, NodeJS.Timeout>` keyed by tab label. `ai/guidelines/architecture-principles.md` § 2 says new per-agent state belongs on the tab record its manager owns, not in a new `Map<label, …>`, and its "How to use these" checklist names that shape explicitly.

## Goal

The pending handle lives on the tab: an optional `idleEscalation` timer on `TabRuntime` (`src/tab/types.ts`), the sub-record that already carries the tab's `busy` flag, `cwd`, `context` and `queue`, reached through `tabRuntime` (`src/tab/runtime.ts`). The module keeps no per-tab state of its own, only the bus subscription.

## Design decisions

- **`TabRuntime`, not the harness payload or the PTY runtime registry.** `Tab.harness` is the wire-shaped `HarnessView`, so a timer handle does not belong there. `HarnessRuntimes` (`src/harness/runtime-registry.ts`) is keyed by PTY id and releases on PTY exit, which would add a new cancel cause (a harness process exiting) and need a label→PTY lookup from `applyBusyTransition`. `TabRuntime` is server-only per-tab state, and its readers — `buildAgentStateFromTab` (`src/tab/agent-state.ts`) and the view builder (`src/tab/view.ts`) — pick named fields, so a `Timeout` on it is never serialized.
- **Always resolve through `managers.tab.byLabel`.** `removeTabAt` spreads each surviving tab into a new object, but the spread is shallow, so the `runtime` object is shared by every copy; reading it from the live tab at arm, cancel, and fire time is what keeps all three on the same handle.
- **`cancelHarnessIdleEscalation` and `disposeHarnessIdleEscalations` take `Managers`.** The bus subscription, attached on first arm, captures the `Managers` that armed it and is released by dispose as before. `disposeHarnessIdleEscalations(managers)` walks `managers.tab.tabs`. `HarnessManager.closeTab` and `HarnessManager.dispose` (`src/harness/manager.ts`) pass `this.managers`; `closeTab` runs in the close walk before the tab record is removed, so the lookup still finds it.

## Implementation steps

1. `src/tab/types.ts`: add `idleEscalation?: NodeJS.Timeout` to `TabRuntime`, with a one-line comment naming its owner.
2. `src/harness/idle-notification.ts`: drop `pending`; `schedule` writes the handle to `tabRuntime(tab).idleEscalation`; `cancelHarnessIdleEscalation(managers, label)` clears and drops it; `escalate` drops it before deciding; `disposeHarnessIdleEscalations(managers)` clears every tab's handle and unsubscribes. An arm for a label with no tab does nothing.
3. `src/harness/manager.ts`: pass `this.managers` to both calls.
4. Tests: update `src/harness/idle-notification.test.ts`, the escalation block of `src/harness/busy-status.test.ts`, and the two remote cases in `src/remote/pty-session.test.ts` for the new signatures.

## Tests

Every existing case in `src/harness/idle-notification.test.ts`, the `busyStatusHandler idle escalation` block in `src/harness/busy-status.test.ts`, and the arm/cancel cases in `src/remote/pty-session.test.ts` must keep passing with only their call signatures changed. One new case in `src/harness/idle-notification.test.ts`: the pending handle is found on the live tab after the tabs are replaced by shallow copies (the shape `removeTabAt` produces), so a badge clear on the copy still cancels it and nothing is notified.

## Out of scope

- Any behavior change: arming, replacing, deferring, cancelling and firing all stay as they are.
- The dwell's own module-level handle in `src/tab/dwell.ts`, which holds one global candidate rather than per-tab state.
- No spec or user documentation change.
