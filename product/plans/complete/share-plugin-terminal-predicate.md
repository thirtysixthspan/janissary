# Share one predicate for a plugin tab that owns a terminal

**Complexity: 2/10** — one exported pure predicate replaces three inline copies of the same check; no wire, client, or plugin-contract change and no behavior change.

## Goal

`send`, `queue`, and schedule targeting decide by one rule whether a plugin tab accepts shell input: the tab is a plugin tab and it owns a live terminal. Today each writes that rule out separately, so a later change to terminal ownership made in one place leaves the three disagreeing about whether a shell tab is a valid target.

## Context

The check is `tab.view === 'plugin' && managers.pty.terminalIdFor(tab.label) !== undefined`, written three times:

- `deliverTo` in `src/commands/send.ts` branches on `target.view === 'plugin'` and then refuses with `Tab "<label>" does not accept input.` when `terminalIdFor` answers `undefined`.
- `run` in `src/commands/queue.ts` computes `pluginTerminal` inline and uses it both to refuse a non-command tab with `Tab "<label>" has no command queue.` and to skip the server-side drain for a shell, whose client drains its own queue.
- `canRunSchedules` in `src/schedule/targets.ts` accepts the command views, then the same plugin-terminal check. It feeds both `resolveTargetTab` in `src/commands/schedule.ts` and the "New schedule" dialog's target list in `src/schedule/manager.ts`.

`src/tab/plugin-terminals.ts` already owns the one place a plugin tab's terminal is spawned, so the predicate sits beside it. `PseudoterminalManager.terminalIdFor` in `src/pseudoterminal-manager.ts` finds a tab's non-transport PTY by label.

`ScheduleManager.fire` in `src/schedule/manager.ts` also calls `terminalIdFor`, but it needs the PTY id to type into, not a yes-or-no answer, so it stays as it is.

## Approach

Export `ownsTerminal(tab, pty)` from `src/tab/plugin-terminals.ts`:

```ts
export function ownsTerminal(
  tab: Pick<Tab, 'label' | 'view'>,
  pty: Pick<PseudoterminalManager, 'terminalIdFor'>,
): boolean
```

It takes the PTY manager rather than all of `Managers`, because the PTY manager is all it reads. It checks the `view` discriminant rather than calling `isPluginTab`, which also demands the payload: a plugin record with a live terminal but no payload is not a case any caller distinguishes today, and the existing command tests build plugin targets without one.

Rejected alternative: a method on `TabManager`. The tab manager does not hold the PTY manager at construction (`managers.pty` is assigned later, which is why `spawnPluginTerminal` takes it per call), so the method would have to reach it through `Managers` anyway.

## Implementation steps

1. In `src/tab/plugin-terminals.ts`, add and export `ownsTerminal`.
2. In `src/commands/send.ts`, have `deliverTo` enqueue for a target where `ownsTerminal(target, managers.pty)` holds; a plugin tab without a terminal falls through to the existing `does not accept input` refusal.
3. In `src/commands/queue.ts`, compute `pluginTerminal` with `ownsTerminal(target, managers.pty)`.
4. In `src/schedule/targets.ts`, return `ownsTerminal(tab, managers.pty)` after the command-view check.

## Tests

- New `src/tab/plugin-terminals.test.ts`: `ownsTerminal` is true for a plugin tab whose label has a terminal, false for a plugin tab without one, and false for a non-plugin tab even when a terminal is registered under its label.
- Existing shell-tab cases in `src/commands/send.test.ts`, `src/commands/queue.test.ts`, and `src/commands/schedule.test.ts` keep passing unchanged.

## Spec

`product/specs/shell-tab.md`: after the scheduling paragraph, state that `send`, `queue`, and `schedule` accept a plugin tab by the one rule that it owns a live terminal (`ownsTerminal` in `src/tab/plugin-terminals.ts`), and give each command's refusal for a plugin tab without one.

## Out of scope

- `ScheduleManager.fire`'s own `terminalIdFor` call, which needs the id rather than the answer.
- Any change to which tabs are valid targets.
