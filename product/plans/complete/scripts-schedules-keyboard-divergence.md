# Scripts and schedules list tabs disagree on Enter from a focused header button

**Complexity: 2/10** — a record-only change. No source, test, or spec file changes. It records a verified divergence between two list tabs and the choice the owner must make, because the repair either moves a guard into the published client plugin API or leaves two copies apart.

## Goal

Record in the product plans that the scripts tab's keyboard-ownership guard is a private copy with no counterpart in the schedules tab, name the two files, and set out the two options the owner chooses between. This run changes no behavior.

## Problem

The divergence was checked by reading the code on `feature/scripts-tab` (PR #1739). No test was run for this record.

`web/src/plugins/scripts/ScriptsTab.tsx` has a module-private `ownsKey(event)` at lines 8-11. It returns true when `event.target === event.currentTarget`, or when the target sits inside a `.scripts-row`. `onKeyDown` returns before it reads the key when that is false (line 46), so a keydown from the `New script` button or the host split control is left to that control. The repair commit `768d060c` added this guard, with a test that presses Enter on the `New script` button with a row selected and expects `create` and not `open`. Its plan is `product/plans/complete/scripts-tab-keydown-target.md`, which names the schedules tab as "the same shape" and says the same guard would fix it. Subplan `product/plans/complete/06-scripts-client-list.md` specifies no target check: its keyboard section sends the move keys and Enter for the selected row with no rule about the target. The guard is therefore a repair addition to the scripts tab, not a planned part of it.

`web/src/plugins/schedules/SchedulesTab.tsx` has no such guard. Its container `onKeyDown` (lines 65-83) handles the navigation keys, Backspace and Delete, and Enter for every keydown that reaches the container. The `New schedule` button sits inside that container (lines 95-102). So Enter on the focused button runs `focusOwner` for the selected entry and calls `preventDefault` (lines 78-81). As the repair plan verified for the scripts button, that suppresses the button's own press, so the owner tab opens instead of the dialog. Arrow Up, Arrow Down, Home, and End on that button also move the schedules selection (lines 66-71), while the scripts tab leaves them alone.

The schedules row carries a nested control that the scripts row does not. `web/src/plugins/schedules/SchedulesRows.tsx` (lines 33-55) puts a `.schedules-row-delete` trash button inside each `.schedules-row`. Under the current code, Enter on a focused trash button also reaches the container and runs `focusOwner`. A shared guard whose row clause matches a row's descendants, as the scripts guard's `closest('.scripts-row')` does, would still claim that key, so it would not fix the trash button. The scripts rows hold no nested controls, so the scripts clause has never had to decide this case.

The existing schedules tests do not cover a key pressed on a header button. `web/src/plugins/schedules/SchedulesTab.test.tsx` fires Enter on the list container (lines 115-125 and 245-252) and clicks the `New schedule` button (lines 328-352), but none presses a key on it. The schedules spec (`product/specs/scheduling.md`, lines 99-101) describes Enter on the selected row and a click on the `+` button, and it says nothing about Enter on the button, so no spec describes the current behavior as intended.

## Options

**Option A: promote the guard to a shared module.** Move the guard into a module under `web/src/shared/` beside `list-selection.ts`, taking the row class as a parameter, and re-export it from `web/src/plugins/api.ts` beside `nextListSelection`, additively so `TAB_PLUGIN_API_VERSION` does not move. Both `ScriptsTab.tsx` and `SchedulesTab.tsx` would import it through `../api`, because the client tab plugin rule in `eslint.plugin-boundaries.mjs` (lines 43-54) lets a non-test plugin file import only `../api`, `../shared.css`, and its own `@shared/plugins/<id>/shared`. This is the route `product/plans/complete/shared-list-selection-clamp.md` took for the list rule. It removes the divergence on Enter and the arrow keys from the `New schedule` button. Its costs: it adds a published symbol to the plugin surface that every later plugin inherits, and it makes the schedules tab the second real consumer of the guard under `ai/guidelines/react-code-organization.md` §2, which permits promotion only when the module serves both consumers without feature-specific special-casing. The row clause is where that test falls. A descendant match keeps the schedules trash button's Enter owned by the list; a clause that matches only the row element itself does not. The owner must choose that clause.

**Option B: keep the two copies and accept the divergence.** Leave `ownsKey` private in `ScriptsTab.tsx` and leave `SchedulesTab.tsx` as it is. Enter and the arrow keys on the `New schedule` button stay different between the two list tabs. Each later change to the list keyboard rule has to be made in both copies, and a future list tab either copies one of them or copies neither. This costs no shared API and keeps the scripts guard feature-local, which §2 prefers until a second real consumer exists.

## Decision

The owner decides between Option A and Option B. This run does not choose, for two reasons. Option A changes the published client plugin API, and the promotion rule in `ai/guidelines/react-code-organization.md` §2 makes that an owner call. The row clause also needs a decision that is the owner's to make. Until the owner chooses, both copies stay as they are, and no schedules-tab repair plan is written.

Either option is compatible with the second entry in `product/backlog/pull-request.md`, which pins the scripts guard's row clause and movement-key behavior with tests. Those tests exercise the behavior through `ScriptsTab.tsx`, and Option A keeps that behavior unchanged.

## Changes

None. No source, test, spec, or documentation file changes. `web/src/plugins/scripts/ScriptsTab.tsx`, `web/src/plugins/schedules/SchedulesTab.tsx`, `web/src/plugins/api.ts`, and the scripts and schedules test files stay as they are.

## Tests

None. The plan changes no code and no behavior, so there is nothing new to test. The divergence was established by reading the two `onKeyDown` handlers and the controls they contain, not by running a test.

## Spec

Unchanged. The change records a decision and changes no behavior. `product/specs/scheduling.md` describes Enter on the selected row and the `+` button's click, and it does not describe Enter on the button, so the spec needs no edit for this record.

## Docs

None needed. `help.md` and `documentation/user-documentation/` describe no change in behavior.

## Out of scope

- Any repair to either tab. The owner chooses Option A or Option B, and a repair plan follows that choice.
- The trash button's Enter on the schedules row. It is folded into the owner's row-clause decision under Option A rather than handled as a separate item.
- The second entry in `product/backlog/pull-request.md`, which stays as it is.
