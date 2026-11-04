# Align the canonical plan's record-tab Terminate presentation

**Complexity: 2/10** — one sentence in a completed plan's decision 22 plus the required plan and backlog bookkeeping; no production, test, spec, help, user-documentation, or pull-request-description change.

## Goal

Resolve PR #1916's recorded finding: "Plan fidelity: align the canonical plan's record-tab Terminate presentation with the delivered hide-at-terminal UI."

`product/plans/complete/connections-tabs.md` decision 22 says the record-tab Terminate "is disabled once cleanup begins". The delivered UI, and the spec and guide corrected in `5f226510`, instead disable the control on the click and remove it when the record reports a terminal status, while the agent monitor's Terminate stays visible and disabled through cleanup. A later reader could follow the obsolete disabled-through-cleanup expectation and treat the delivered behavior as a regression.

## Approach and evidence

- `web/src/plugins/connections/ConnectionTab.tsx` sets `canTerminate` only for `record.kind === 'agent' && record.status === 'Running'`, so the control exists only while the run is running, and renders it with `disabled={controller.pendingTerminate}`.
- `web/src/plugins/connections/useConnectionsController.ts` sets `pendingTerminate` on the terminate intent, clears it on a rejected intent, and clears it when the record reports a terminal status; the record tab then stops rendering the control.
- `web/src/plugins/agent-monitor/view.tsx` renders its Terminate for every status and disables it for `Cleaning up`, `Completed`, `Failed`, and `Terminated`, so the monitor's control remains visible and disabled through cleanup.
- `product/specs/connections-tab.md` and `documentation/user-documentation/command-bar/connections.md` already describe the record tab's disabled-then-removed control and the monitor's separate visible disabled control.
- `web/src/plugins/connections/ConnectionTab.test.tsx` already pins the in-flight disable, the rejection reset, and the absence of Terminate for terminal agent statuses.

The correction changes only the presentation clause. "It acts exactly like the agent-monitor's Terminate", the action semantics, and the plan's 8/10 complexity rating stay unchanged.

## Implementation steps

1. In `product/plans/complete/connections-tabs.md` decision 22, replace only "and is disabled once cleanup begins" with the delivered presentation: the record tab disables the control from the click until the record reports its terminal status and then removes it, while the agent monitor's own Terminate stays visible and disabled through cleanup.
2. Preserve every other line of the completed plan, including decision 22's first sentence, the "acts exactly like the agent-monitor's Terminate" equivalence, the action semantics, and the 8/10 complexity rating.
3. Run `$janissary/scripts/run.mjs check-diff`, promote this plan from `ready/` to `complete/`, and remove only the resolved entry from `product/backlog/pull-request.md`, preserving the other three entries.
4. Commit and push to `feature/connections-tabs`; leave PR #1916 open and its description unchanged.

## Tests

None new. This changes no behavior, and the existing `web/src/plugins/connections/ConnectionTab.test.tsx` already pins the in-flight disable, rejection reset, and terminal removal. `$janissary/scripts/run.mjs check-diff` is the gate; a Markdown-only change selects no source lint, typecheck, or related test job. Run `git diff --check` before publication.

## Out of scope

- `web/src/plugins/connections/ConnectionTab.tsx`, its test, and the controller; the record-tab presentation stays as delivered.
- Making the record tab keep a visible disabled control through cleanup. That would be a separate UI decision.
- `product/specs/connections-tab.md`, `documentation/user-documentation/command-bar/connections.md`, help pages, and every other plan.
- The source plan's action semantics and 8/10 rating, and every other line of the file.
- Other backlog entries, the pull-request title and body, merging, closing, or rewriting history.

## Completion

- Replaced decision 22's "is disabled once cleanup begins" clause with the delivered presentation: the record tab disables the control from the click until the record reports its terminal status and then removes it, while the agent monitor's own Terminate stays visible and disabled through cleanup.
- Kept decision 22's first sentence, the agent-monitor equivalence, the action semantics, the 8/10 rating, and every other line of the completed plan unchanged.
- Made no code, test, spec, guide, help, or other plan change; `web/src/plugins/connections/ConnectionTab.test.tsx` already pins the in-flight disable, rejection reset, and terminal removal.
- Removed only the resolved backlog entry, leaving three entries in `product/backlog/pull-request.md`.
- `$janissary/scripts/run.mjs check-diff` selected no source checks for the Markdown-only change.
