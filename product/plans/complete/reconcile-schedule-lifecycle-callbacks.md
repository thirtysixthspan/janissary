# Reconcile schedule lifecycle callbacks

**Complexity: 7/10** — reconcile per-entry hooks with schedule replacement, settle replaced owners, and report remote auto-resume cancellation to the far side.

## Goal

Ensure callbacks settle exactly once whenever their schedule entry fires, is removed, or is replaced, including remote auto-resume cancellation.

## Approach

Make `ScheduleManager.set` compare prior entry identities with the replacement list, retain hooks for unchanged entries, and detach then invoke removal hooks for removed or replaced entries. Make `add` settle the previous entry's removal hook before installing a same-ID replacement and its hooks. For remote resume entries, acknowledge both firing and removal to the far side and update the local auto-resume flag on removal; cancellation must not type the prompt.

## Implementation steps

1. Reconcile callbacks in `src/schedule/manager.ts` for `set` and same-ID `add` replacement.
2. Add scheduler lifecycle tests and real-manager command tests in `src/schedule/manager.test.ts` and `src/commands/schedule.test.ts`.
3. Add the remote removal acknowledgement and flag settlement in `src/remote/pty-session.ts`, with coverage in `src/remote/pty-session.test.ts`.
4. Update `product/specs/harness.md` and `product/specs/remote-server.md` for cancellation acknowledgement behavior.

## Tests

- Setting a filtered schedule settles removed hooks and retains hooks for unchanged entries.
- Replacing a same-ID entry through `add` settles the old owner once and leaves the new hook active.
- CLI cancellation and clear settle hooks through a real `ScheduleManager`.
- A remote resume removal acknowledges the far side, resets the local flag, and does not type a prompt.

## Out of scope

- Changing schedule parsing, firing order, or delivery retry behavior.
- Adding a new remote protocol frame; the existing resume acknowledgement covers a settled entry.
