# System schedules 06: system-shell profile isolation

**Complexity: 4/10**: three profile decision seams protect managed identity during capture, destructive relaunch replacement and subjectless shell placement, with focused server tests and no new protocol.

This isolates the managed shell from profile save and profile relaunch while preserving ordinary profile ordering and shell-open behavior.

## Goal

Ensure profile operations never capture, destroy, move, dock, group or focus the managed system shell as a profile shell result. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed 01 for managed tab identity and 03 for the startup-created `systemShell` record. The PTY recovery and client generation contracts in 04/05 are not needed; profile protection is keyed to stable managed identity.
- `profile save` silently excludes the tab whose server-owned `systemShell` identity is true, regardless of visibility, alias or order. Do not infer identity from label/title, and do not change the existing `janus` exclusion.
- Before any profile relaunch destructive close, skip a case-insensitive authored `system` entry and report exactly `system (reserved for the system tab)` in `Skipped:`. Perform this reservation check before matching/closing any existing tab. A hand-authored entry cannot target or replace the managed tab.
- In `profile/view-tabs.ts`, the subjectless shell/plugin fallback may select a shell opened by the current profile command, but it must never fall back to the pre-existing managed system shell or `janus` when the command opened nothing. Do not change subjectful matching, ordinary profile order, focus, name-clash behavior or newly opened shell precedence.
- Profile schedules remain outside this plan and are not captured or persisted here; plan 12 owns reporting/skipping authored `schedule system` lines.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Managed system identity | completed 01 and 03; `Tab.systemShell` | Check the host-owned identity field for profile-save and fallback exclusions. |
| Profile capture | `src/profile/save/route.ts` (`captureTab`) | Filter before serializing while retaining ordinary profile ordering. |
| Profile replacement | `src/profile/entry-resolve.ts` (`closeMatchingTabs`) | Add a reserved-entry skip before destructive matching/close and preserve existing report collection. |
| Profile shell placement | `src/profile/view-tabs.ts` (`commandTarget`, `openedTab`) | Keep newly opened shell detection first; exclude only existing system and `janus` fallback candidates. |

## File scope

- Production: `src/profile/save/route.ts`, `src/profile/entry-resolve.ts`, and `src/profile/view-tabs.ts`.
- Tests: `src/profile/save/{route,index}.test.ts`, new `src/profile/entry-resolve.test.ts`, `src/profile/{agent-opener,view-tabs-shell,manager}.test.ts`.
- Specs/docs: update `product/specs/profiles.md` and `documentation/user-documentation/automation/profiles.md` with the managed-tab exclusion and exact skipped-entry text.

## Ordered changes

1. Exclude managed system identity before `profile save` captures tab fields; test hidden, revealed, renamed and reordered states.
2. Add the case-insensitive reserved `system` entry check before the relaunch close pass, with the exact `Skipped:` report and no destructive action.
3. Exclude existing managed system and `janus` shells from subjectless plugin fallback, while ensuring a shell opened by the current profile operation still wins.
4. Cover capture, close-pass and failed-open fallback paths in profile tests; update profile spec and user documentation.

## Tests and verification

Save profiles with the system tab hidden, visible, renamed and reordered and prove none contains it. Relaunch a profile with an authored `system` entry and assert the exact skipped line plus zero destructive closes of the managed shell. Exercise subjectless shell commands that open a new shell and that open nothing; only the new shell is positioned, and neither `system` nor `janus` is moved, docked, grouped or focused as fallback. Preserve ordinary profile entries, duplicate behavior and focus. Run `./scripts/run.mjs check-diff`.

## Boundaries

No system-shell startup/recovery, profile schedule parsing, project schedule persistence or general profile matching rewrite. Plan 03 creates the identity; plan 04 recovers the server PTY; plan 05 reports client generations; plan 12 isolates project schedule lines in profiles.
