# Correct the record-tab Terminate disabled state

**Complexity: 2/10** — three prose corrections in the pull request description, the connections-tab behavior spec, and the Connections user guide, plus the required plan and backlog bookkeeping; no production, test, cleanup, or outcome change.

## Goal

Resolve PR #1916's recorded finding: "Description fidelity: state that the record-tab Terminate control is disabled while the termination is pending and removed when the record reports a terminal status, not disabled through cleanup."

The pull request body says an agent run's record-tab Terminate control "disables once cleanup begins", and its agent-runs "How to verify" step asks the reader to confirm that disabled state. `product/specs/connections-tab.md` and `documentation/user-documentation/command-bar/connections.md` repeat the same claim. The delivered record-tab UI instead disables the control on the click and removes it as soon as the record reports `Completed`, `Failed`, or `Terminated`, because the tab renders Terminate only while an agent record is `Running`. The agent monitor's separate Terminate stays visible and disabled through `Cleaning up`.

Correct the four sentences so the record tab and the monitor are described by their actual presentation, without changing behavior or the action semantics of Terminate.

## Approach and evidence

- `web/src/plugins/connections/ConnectionTab.tsx` sets `canTerminate` only for `record.kind === 'agent' && record.status === 'Running'` and renders the button only then, with `disabled={controller.pendingTerminate}`.
- `web/src/plugins/connections/useConnectionsController.ts` sets `pendingTerminate` on the terminate intent, clears it on a rejected intent, and clears it when the record reports a terminal status; the record tab then stops rendering the control.
- `web/src/plugins/agent-monitor/view.tsx` renders its Terminate for every status and disables it for `Cleaning up`, `Completed`, `Failed`, and `Terminated`, so the monitor's control remains visible and disabled through cleanup.
- `AgentRun.finish` records the terminal status before asynchronous cleanup, which is why the record tab's control is removed at the terminal report rather than held through cleanup.
- `web/src/plugins/connections/ConnectionTab.test.tsx` already pins the in-flight disable, the rejection reset, and the absence of Terminate for terminal agent statuses.

The action semantics stay as the source plan records them: Terminate ends only that run and matches the monitor's terminate intent. This correction changes only the presentation wording.

## Implementation steps

1. Rewrite the "What shipped" sentence under "Plugin-owned list and record tabs" in the pull request body to say the record tab's Terminate is disabled from the click until the record reports its terminal status and is then removed, while the agent monitor's own Terminate stays visible and disabled through cleanup.
2. Rewrite the agent-runs "How to verify" step 2 in the pull request body to ask the reader to confirm that same record-tab removal and the monitor's visible disabled control.
3. Replace the agent-run sentence under "The connection tab" in `product/specs/connections-tab.md` with the same record-tab presentation and the monitor distinction, keeping the action equivalence to the monitor's Terminate.
4. Replace the agent-run sentence under "Connection tabs" in `documentation/user-documentation/command-bar/connections.md` the same way.
5. Preserve every other paragraph of the pull request body byte-for-byte, including the records and retention text and the manual acceptance table; preserve the source plan's 8/10 rating and its text.
6. Run `$janissary/scripts/run.mjs check-diff`, promote this plan to `product/plans/complete/`, and remove only the resolved entry from `product/backlog/pull-request.md`, preserving the technical-debt entry.
7. Commit and push the plan, spec, guide, and backlog bookkeeping, then apply the revised body to the open pull request with `gh pr edit --body-file`.

## Tests

None new. This changes no behavior, and the existing `web/src/plugins/connections/ConnectionTab.test.tsx` already pins the in-flight disable, rejection reset, and terminal removal; the agent-monitor presentation is unchanged. `$janissary/scripts/run.mjs check-diff` is the gate, and a Markdown-only change selects no source lint, typecheck, or related test job. Run `git diff --check` before publication.

## Out of scope

- `web/src/plugins/connections/ConnectionTab.tsx`, `web/src/plugins/connections/ConnectionTab.test.tsx`, the controller, cleanup, and outcome behavior, all of which stay unchanged.
- Changing the record tab to a visible disabled control through cleanup. That would be a separate source and UI decision, made before this wording correction.
- The source plan's action semantics and its 8/10 rating; it stays a historical completed record.
- Record retention rules, the manual acceptance rows, and every other pull request body paragraph.
- Any other backlog entry, merging or closing the pull request, or rewriting published history.

## Completion

- Rewrote the PR body's "What shipped" record-tab sentence and its agent-runs "How to verify" step 2 to distinguish the record tab's disabled-then-removed control from the monitor's visible disabled control.
- Corrected the agent-run sentence in `product/specs/connections-tab.md` and the matching sentence in `documentation/user-documentation/command-bar/connections.md`.
- Left the UI, controller, cleanup, outcome, tests, source plan, retention rules, manual acceptance rows, and every other body paragraph unchanged.
- Removed only the resolved entry from `product/backlog/pull-request.md` and pushed the bookkeeping to the open pull request branch.
