<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* the msg command to a shell tab, of each type, should be supported.


* Open pickers raised from a shell command bar over the tab that raised them and act on that tab's bar and queue.

Existing Issue: The task and queue pickers decide which command bar and queue to use from the current tab rather than the picker's source tab, and a picker raised by a hidden, undocked shell (for example while draining its queue) is rendered nowhere while still taking modal keys. Severity: 6/10

Existing Risk: 6/10 - A task picked from a docked shell's `tasks` picker is inserted into the centre agent bar, `queue` from a docked shell lists the agent's queue, and a queued `tasks` line in a background shell opens an invisible picker that captures arrow, Return and Escape in whatever tab is in front.

Proposal Risk: 3/10 - Pickers follow their source tab and an invisible source falls back to the visible tab, with residual risk in any picker hook not yet keyed on the source tab.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: key shell-raised pickers on their source tab". In `web/src/pickers/useTaskPicker.ts`, choose the insertion target from `pickerSourceTab ?? current.label` (and only use the shell insertion path when that tab is a shell); in `web/src/pickers/useQueuePicker.ts` and `web/src/pickers/usePickerOverlays.ts`, take `isShellTab`, `queueItems` and the edit/delete targets from the source tab's record instead of `current`. In `web/src/App.tsx`, where `pickerSourceTab` is set, refuse to set a source tab that is neither the current tab nor docked-and-visible (clear the source so the picker renders over the current tab), or skip opening a picker for an invisible source. Add App-level tests (in `web/src/App.test.tsx` or `web/src/pickers/useTaskPicker`/`useQueuePicker` tests) that a docked-shell `tasks` pick calls the shell's insertion handler and that an intercept from a hidden shell does not leave an unrendered modal picker; keep `web/src/pickers/useQueuePicker.test.tsx` passing.
