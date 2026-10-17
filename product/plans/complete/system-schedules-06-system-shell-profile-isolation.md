# System schedules 06: system-shell profile isolation

**Complexity: 4/10** — three profile decision seams protect managed identity during capture, destructive relaunch replacement, and subjectless shell placement, with focused server tests and no new protocol.

This isolates the managed shell from profile save and profile relaunch while preserving ordinary profile ordering and shell-open behavior.

## Goal

Ensure profile operations never capture, destroy, move, dock, group or focus the managed system shell as a profile shell result. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: completed `product/plans/complete/system-schedules-01-hidden-tab-lifecycle.md` (the `Tab.systemShell` identity) and `product/plans/complete/system-schedules-03-system-shell-startup-and-ensure.md` (the startup-created shell marked with that identity). Plans 04/05 are not dependencies; these profile decisions use the stable server-owned identity, not PTY recovery or client generations.
- `profile save` silently excludes the tab whose server-owned `systemShell` identity is true, regardless of visibility, alias or order. Do not infer identity from label/title, and do not change the existing `janus` exclusion.
- Before `closeMatchingTabs` closes any matching entry, skip a case-insensitive authored `system` label and add exactly `system (reserved for the system tab)` to the relaunch `Skipped:` list. Check reservation before tab lookup or `closeTab`, so the managed system tab and any other `system`-labeled tab receive no close side effect. The entry is omitted from the open pass. Do not change the issuing-tab skip or other matching behavior.
- In `profile/view-tabs.ts`, preserve `openedTab`'s first choice: a matching tab created by the current command wins. For its existing-tab fallback only, exclude tabs with `systemShell === true` and the existing `janus` launch shell. Apply the system exclusion by identity regardless of hidden state, label, title, position, or pane. If the command opened nothing, neither excluded tab may be returned for placement, grouping, docking, or focus. Do not change subjectful matching or ordinary profile ordering/focus.
- Profile schedule parsing is outside this plan. Do not parse, capture, or persist system schedule lines here; plan 12 owns reporting/skipping authored `schedule system` lines.

## What already exists (reuse, don't rebuild)

| Piece | Verified seam | Reuse decision |
| --- | --- | --- |
| Managed system identity | `src/tab/types.ts:310–312` (`Tab.systemShell`) and completed plans 01/03 | Read the host-owned marker; never infer managed identity from a user-facing label or visibility. |
| Profile capture | `src/profile/save/route.ts:46–50` (`captureTab`), called by the save capture walk | Return before view routing/serialization for a managed system tab; retain the existing `janus` rule and ordinary tab order. |
| Profile replacement | `src/profile/entry-resolve.ts:14–30` (`closeMatchingTabs`) | Skip the reserved label before `findIndex`/`closeTab`, preserving normal skip reporting and other close matches. |
| Profile shell placement | `src/profile/view-tabs.ts:97–109` (`commandTarget`), `127–130` (`openedTab`) | Preserve newly created candidate precedence; filter only existing system/`janus` fallback results. |

## File scope

- Production: `src/profile/save/route.ts`, `src/profile/entry-resolve.ts`, and `src/profile/view-tabs.ts`.
- Tests: extend `src/profile/save/route.test.ts` for identity exclusion and unchanged `janus`/ordinary capture; add `src/profile/entry-resolve.test.ts` for reserved-case matching, exact skipped value, and no `findIndex`/`closeTab` side effects; extend `src/profile/view-tabs-shell.test.ts` for opened-shell precedence and no fallback when only `systemShell`/`janus` candidates exist. Use `src/profile/agent-opener.test.ts` only if an integration assertion is needed for the exact final `Skipped:` rendering. `src/profile/save/index.test.ts` covers the serialized save/report path; `src/profile/manager.test.ts` is the existing end-to-end command/report harness, not a required unit-test location unless needed to prove the public report.
- Specs/docs: update only the `profile save` and profile relaunch behavior in `product/specs/profiles.md`, and explain the user-visible omission/reserved entry in `documentation/user-documentation/automation/profiles.md`. Do not document internal `systemShell` implementation details in user docs.

## Ordered changes

1. In `captureTab`, return for `tab.systemShell === true` before inspecting `view` or writing a skipped label. Test both hidden and revealed managed tabs, including renamed/reordered fixtures; assert no serialized entry, count change, or skipped-name/report side effect, and retain the ordinary `janus` exclusion.
2. In `closeMatchingTabs`, check a case-insensitive `system` entry before any tab lookup or close. Test `system` and mixed-case `SyStEm`, asserting the exact skipped entry and zero tab lookups/closes for that entry, while a normal matching entry still closes and the issuing-label rule remains unchanged.
3. In `openedTab`, retain newly opened matching tabs as the first choice, then limit the fallback to non-managed, non-`janus` tabs. Test a subjectless command that opens a new shell beside both excluded candidates and one that opens nothing; the latter must return no candidate and cause no placement, docking, or focus of either excluded tab.
4. Update the profile spec and user documentation for the saved-profile exclusion and reserved relaunch result. Keep schedule parsing and profile schedule-line reporting/skipping entirely in plan 12.

## Tests and verification

Run the focused profile tests, then `./scripts/run.mjs check-diff` during development.

Manual end-to-end: start the app with its managed system shell, reveal it with `tab focus system`, rename it, and move it in the strip. Run `profile save isolation`; confirm the saved `tabs` array contains no system-shell entry, the report does not list the managed shell under `Skipped:`, and an ordinary shell entry is still saved. Add a hand-authored harness entry named `SyStEm` to that profile and run `profile launch isolation`: the report must contain exactly `Skipped: system (reserved for the system tab).`, the managed shell must remain alive and in place, and the other entries must relaunch. Confirm the profile's subjectless shell entry opens a new shell and places that new tab, leaving both the managed shell and `janus` untouched. The no-open fallback case is asserted in the focused test because the bundled shell command always opens a shell; do not rely on an artificial runtime command for this manual check.

## Boundaries

No system-shell startup/recovery, profile schedule parsing, project schedule persistence, or general profile matching rewrite. Plan 03 creates the identity; plan 04 recovers the server PTY; plan 05 reports client generations. Plan 12 owns profile schedule-line parsing and reporting/skipping of authored `schedule system` lines; this plan only handles profile tab capture, relaunch matching, and shell placement.
