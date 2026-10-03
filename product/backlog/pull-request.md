<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Put the connections and schedule buttons on the shell tab's row, so the two status windows it renders can be reached.

Existing Issue: The shell tab's metadata row renders only the file navigator, the new-agent button and the split control, so `.shell-tab .tab-connections` matches nothing and the `StatusPanels` it renders can never be shown. Severity: 7/10

Existing Risk: 6/10 - The host pushes connection and schedule rows into the payload on every state change and the tab renders panels for them, but with no control to open either window the rows are computed, shipped and drawn nowhere, so a user with a live shell has no way to see what the tab is connected to.

Proposal Risk: 2/10 - Two more controls in a metadata row narrow it, which is why the agent row's own buttons are the thing to copy rather than invent.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: add the connections and schedule buttons to the shell tab's row". Generated step G4, on a fresh scratch instance: open a shell tab with `zsh` and count `.shell-tab .tab-connections`, which is 0. The row in `ShellTabMeta` in `web/src/plugins/shell/ShellTab.tsx` renders `.tab-open-files`, `.tab-launch-agent` and `capabilities.splitAction` and nothing else, while `AgentTabMeta` in `web/src/shared/AgentTabMeta.tsx` renders the same row with a `StatusWindowButton` for each of the two windows. `StatusPanels` and `useStatusWindows` are already published to plugins and already used by this row, so what is missing is the pair of controls and nothing else. Add them the way `AgentTabMeta` does, each taking its `hasContent` from the corresponding row list in the payload and its handlers from the window `ShellTabMeta` already holds. The plan's Verification section expects "Hover the connections and schedule buttons and confirm the same windows an agent tab shows, the connections one listing this tab's `terminal:zsh`", so this is the plan's own step failing against the plan's own design. `web/src/plugins/shell/ShellTab.test.tsx` asserts the row's own buttons; extend it to assert both window buttons and that the connections window lists the pushed terminal. Say in `product/specs/shell-tab.md` what the two windows show on a shell tab, which it currently does not.


* Correct the pull request's testing step that expects bare `theme` to open a picker from a shell tab, which it does not do.

Existing Issue: Running `theme` with no argument in a shell tab answers with a list of themes appended to that tab's transcript, and a plugin tab draws a terminal in place of a transcript, so the application has answered and the user sees nothing. Severity: 4/10

Existing Risk: 4/10 - The plan's verification step tells a reviewer to "run `theme` and confirm the application answers instead", so a correct implementation looks broken to the person checking it, and the natural conclusion is that the routing rule is wrong when the routing rule is working exactly as specified.

Proposal Risk: 1/10 - Correcting the step changes no behavior; it only tells a reviewer what to look at.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: correct the shell tab verification step that expects bare theme to open a picker". Plan step, from the Verification section of `product/plans/complete/shell-tab.md`: "run `theme` and confirm the application answers instead". Observed on a fresh scratch instance: no picker appears, and the terminal shows nothing new. The cause is in `src/commands/theme.ts`, where a bare `theme` calls `managers.tab.append(tab.label, { input, output })` rather than opening anything, and `dispatchLine` in `src/plugins/context.ts` addresses the answering tab — which for a shell tab is the shell tab, whose transcript no plugin tab renders. `theme dark` does write to the screen instead, because it returns output through `setTheme` rather than appending. The step should read: run `theme dark` in a shell tab and confirm the application's syntax theme changes and the shell answers nothing; and separately note that a command which only reports text — bare `theme`, `help` — records that text where a shell tab does not show it, which `product/specs/shell-tab.md` already states. Do not change the command or the routing to satisfy the old wording: `!theme` remains the documented way to send the word to the shell, and that part of the step passes.


* Establish whether the shell tab's file navigator button is operable, which this run could not confirm.

Existing Issue: The row's file navigator button is present — the row's structure check finds it — but a click on it timed out waiting for the element to become visible in two consecutive runs. Severity: 4/10

Existing Risk: 5/10 - If the button cannot be pressed, one of the three controls the shell row is supposed to share with the agent tab does nothing, and a user opening a shell tab has no route to a file navigator from it.

Proposal Risk: 3/10 - Until it is reproduced the cause is unknown, so a fix may be speculative and the real fault may be a layer above the button.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: reproduce the shell tab file navigator button not accepting a click". Generated step G3, on a fresh scratch instance: open a shell tab with `zsh`, wait for the row, then click `.shell-tab .tab-open-files`. Observed `locator.click: Timeout 30000ms exceeded` on two runs, once with the report "element is not visible" while the shell tab was hidden behind another tab and once with the shell tab visible and focused. `src/plugins/shell/ShellTab.tsx` renders the button and calls `capabilities.openFileNavigator?.()`, and that capability sends `openFileNavigatorFor` with the tab's own label, so the wiring exists. What is not established is why the element is not actionable in the second case: checked and ruled out are that the button is absent, which a row check disproves, and that the tab is hidden, which the tab strip contradicts. Check whether something covers the row — the completion strip `above` the command bar, or the `StatusPanels` overlay rendered by the same row — by asserting `document.elementFromPoint` at the button's centre, and whether the tab the driver clicked is the one the row belongs to when more than one shell tab is open. Report what that shows before changing anything.
