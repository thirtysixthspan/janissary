# Scope deferred tab ownership to the allocating agent run

**Complexity: 8/10** — Deferred callbacks and claimed-file work cross async boundaries, while ownership must remain tied to exact tab incarnations and cleanup must await admitted work.

## Goal

Ensure agent cleanup closes only tabs allocated by that run, even when unrelated tab creation overlaps a deferred plugin callback or claimed-file operation.

## Approach

Retain run allocation admission and completion tracking, but replace whole-tab-list snapshots with an explicit registration callback supplied to each admitted allocation. Call the callback at the point a run-scoped launch, plugin tab, or editor tab is actually created. `AgentRunManager.trackCreatedTab` continues to capture the tab incarnation so later reuse of the same label is not adopted.

## Implementation steps

1. Change the run-allocation helpers to expose an ownership-registration callback and remove global before/after tab-label scans from them and `invokePlugin`.
2. Register plugin launch, `openOrFocusTab`, editor, and claimed-file tabs through the exact allocation that creates them, preserving late-callback refusal and admitted-allocation completion.
3. Add a paused-callback race test that creates an unrelated tab while a run-owned deferred allocation is paused; assert cleanup closes the run-owned tab, waits for its release, and leaves the unrelated tab open. Keep recycled-label and existing-tab cases covered.
4. Update `product/specs/agent-command.md` with the precise run-owned cleanup behavior.

## Tests

- Extend `src/plugins/launch-tab.test.ts` with the unrelated-tab overlap race and retain the existing late-callback, admitted-allocation, recycled-tab, and existing-tab assertions.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Do not expose run IDs through plugin capabilities, wire data, or persisted payloads. Do not change unowned plugin allocation behavior or resolve the other PR backlog entry.
