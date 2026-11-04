# Match caller popup agent rows by incarnation

**Complexity: 3/10** — one ownership condition in the existing `activeAgentRows` loop plus a fixture change and one focused test; the record id, row text, and no-`acpRef` shape stay as they are.

## Goal

Resolve PR #1916's recorded finding: "Plan fidelity: match a running agent row in the caller popup to the caller tab's incarnation, not only its label." A run started from a tab that has since closed keeps its captured caller label and remains live while cleanup finishes. If a new tab reuses that label, the popup for the new tab lists the old run's record, and the new tab can open a record it never started.

## Approach and evidence

`ConnectionManager.activeAgentRows` filters live runs by outcome and caller label only (`src/connection/manager.ts:27`–`:36`). The agent run already captures the caller tab's incarnation at launch (`src/agent/manager.ts:19`–`:28`), and the same identity rule already governs starting a run (`src/agent/manager.ts:36`), closing a caller (`src/agent/manager.ts:72`–`:80`), and nested runs (`src/agent/nested-run.ts:19`). The popup is the remaining surface that compares labels alone.

Look up the open tab for the popup's label with `managers.tab.byLabel(label)` and take its `runtime.incarnation`. If the tab is missing or has no incarnation, there is no live caller identity to match, so no agent row is included. Otherwise include a run only when its captured `caller.incarnation` equals that value, in addition to the existing outcome, label, and record-id filters. The row keeps its `Agent: <task filename>` text and its record-id-only shape with no `acpRef`.

## Implementation steps

1. In `src/connection/manager.ts`, resolve the popup caller's incarnation once from `this.managers.tab.byLabel(label)?.runtime?.incarnation` and require `run.caller.incarnation` to equal it inside `activeAgentRows`, skipping every run when the tab or incarnation is absent. Leave the outcome, label, and record-id filters, the row text, and the no-`acpRef` shape unchanged.
2. In `src/connection/manager.test.ts`, give the fixture's `tab.byLabel` an open tab with a runtime incarnation, and update the existing agent-row cases' caller fixtures to carry that incarnation.
3. Add a test with two live runs under the same caller label — one whose caller incarnation matches the open tab and one from a previous incarnation — and assert only the matching run's row appears, with the existing text, kind, and record id and no `acpRef`.
4. In `product/specs/connections-tab.md`, state that popup ownership compares the run's captured caller incarnation, so a run from a closed tab does not appear under a later tab that reused its label.
5. Run `$janissary/scripts/run.mjs check-diff` after the source and test changes.
6. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving every other entry byte-for-byte.

## Tests

- `src/connection/manager.test.ts`: an active run whose caller label and incarnation match the open tab still yields one `Agent: <task>` row with its record id and no `acpRef`.
- `src/connection/manager.test.ts`: with a matching-incarnation run and a previous-incarnation run under the same label, only the matching run appears.
- Existing another-caller, completed-run, missing-record-id, and catalog-distinctness cases still hold with incarnation-bearing fixtures.
- `src/agent/manager.test.ts` close-caller coverage is unchanged.

## Out of scope

- Run creation, caller capture, caller-close termination, and nested-run identity; they already compare incarnations.
- Record-store ownership, record ids, the popup's open behavior, and the client's row identity.
- Other backlog entries, the pull request title or body, and merge or history rewriting.
- New user documentation: no existing help or user guide describes the popup's ownership rule.

## Completion

- `ConnectionManager.activeAgentRows` now resolves the popup tab's runtime incarnation through `managers.tab.byLabel` and includes a live run only when its captured caller incarnation equals it; a missing tab or incarnation yields no agent rows. The outcome, label, and record-id filters, the `Agent: <task filename>` text, and the no-`acpRef` shape are unchanged.
- Added two cases to `src/connection/manager.test.ts`: matching and previous-incarnation runs under the same label yield only the matching row, and no open tab under the caller label yields none. Updated the existing agent-row fixtures to carry incarnations.
- `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and server tests; the focused `src/connection/manager.test.ts` suite passed 13 tests.
- Updated `product/specs/connections-tab.md` to state that popup ownership compares the run's captured caller incarnation, so a run from a closed tab does not appear under a later tab reusing its label.
- Removed only the resolved backlog entry, leaving four entries unchanged.
