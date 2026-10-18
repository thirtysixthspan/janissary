<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle Enter on the focused plus button as a press of that button, not as an open of the selected row.

Existing Issue: The tab's container keydown handler sends open for the selected row on any Enter, including Enter pressed on the focused plus button or the host split control, which sit inside that same container, so the button's own press is suppressed and a different script is opened instead. Severity: 4/10

Existing Risk: 4/10 - A user who clicks plus and then presses Enter, or who tabs to plus while a row is selected, opens a different script and never gets the new one they asked for, with nothing on screen to say why.

Proposal Risk: 2/10 - Enter stays owned by the container for every other target, so a future header control that needs Enter must follow the same target check, and the added test pins the plus-button case so a regression there fails loudly.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "handle Enter on a focused header control as that control's press". In web/src/plugins/scripts/ScriptsTab.tsx, the onKeyDown handler should treat Enter as open only when event.target is the tab container itself (compare event.target with event.currentTarget), and otherwise return before calling preventDefault or stopPropagation, so the plus button's own activation, and the host split control's, runs unchanged. Clicking a row hands focus back to the container in selectRow, so the row path still arrives with the container as its target and keeps its current behavior. Add a case to web/src/plugins/scripts/ScriptsTab.test.tsx that clicks a row to select it, fires keyDown Enter on the button labelled New script, and asserts that the intent spy was not called with open and that fireEvent.keyDown returned true, meaning the event was not prevented. Add a second case that clicking that same button with a row selected still sends create with an empty payload. The existing test that fires Enter on the container and the existing double-click open test must keep passing untouched. Leave web/src/plugins/scripts/scripts-keys.ts unchanged, because its keyMeaning mapping is the one the subplan specifies and the target guard belongs in the tab. The schedules tab in web/src/plugins/schedules/SchedulesTab.tsx carries the same Enter shape; this entry does not change it.
