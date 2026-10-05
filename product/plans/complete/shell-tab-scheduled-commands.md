# Let shell tabs be targets of scheduled commands

**Complexity: 4/10** — `schedule` accepts only agent and harness tabs as targets, so scheduling in a shell tab (from its own command bar, or `in <shell tab>` from elsewhere) is refused with `Tab "<label>" cannot run scheduled commands.`, and the "New schedule" dialog leaves shell tabs out of its target list. The scheduler's firing loop also only knows how to deliver to those two kinds of tab.

## Goal

A shell tab can hold scheduled commands like any agent or harness tab: `schedule` and the "New schedule" dialog accept it as a target, its schedule shows in its metadata row as it already would, and each due entry is typed into the tab's zsh as a line of input, as if entered at the terminal.

## Approach

The host decides eligibility from what a tab has rather than from which plugin made it: a plugin tab that owns a live terminal can run scheduled commands, because there is a process to type into. One predicate, `canRunSchedules(tab, managers)`, answers that for the `schedule` command and for the dialog's target list, which today restate the agent-or-harness rule separately. The pseudoterminal manager gains `terminalIdFor(label)`, the id of the first local terminal a tab owns, which the predicate and the firing loop both use.

When an entry falls due on such a tab, the scheduler writes the command and a newline to that terminal and announces the firing like any other. A tab whose terminal is gone keeps the entry due, the same retry a harness tab that is not running gets. Plugin tabs are never persisted as agent state, so their schedules live in memory for the session, as a harness tab's do.

## Implementation

1. `src/pseudoterminal-manager.ts`: add `terminalIdFor(label)`.
2. New `src/schedule/targets.ts`: `canRunSchedules(tab, managers)` — agent, harness, or a plugin tab with a terminal.
3. `src/commands/schedule.ts`: use the predicate in `resolveTargetTab`.
4. `src/schedule/manager.ts`: use the predicate in `scheduleLaunchView`; in `fire`, type a due entry into a plugin tab's terminal.
5. Update the scheduling spec's target rules and the shell-tab spec.

## Tests

- `src/schedule/manager.test.ts`: a due entry on a plugin tab with a terminal is written to that terminal with a newline and announced; one on a plugin tab whose terminal is gone stays due; the dialog's target list includes a plugin tab with a terminal and excludes one without.
- `src/commands/schedule.test.ts`: scheduling in a plugin tab with a terminal is accepted; a plugin tab without one is still refused.
- `src/pseudoterminal-manager.test.ts`: `terminalIdFor` returns the tab's own terminal and nothing for a tab without one.

## Out of scope

- Holding a due entry until zsh is idle; like a harness tab, the line is typed when it falls due.
- Persisting a shell tab's schedule across restarts.
- Plugin tabs that own no terminal.
