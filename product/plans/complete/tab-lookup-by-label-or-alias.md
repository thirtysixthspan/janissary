# Resolve every user-typed tab name through one label-or-alias lookup

**Complexity: 3/10** — one new pure function beside `byLabel`, three inline copies of the same predicate replaced by it, and one command (`schedule … in <tab>`) switched from exact to label-or-alias matching. No new architecture, no wire change.

"Which tab did the user mean" is answered two ways today. `resolveTarget` in `src/commands/resolve-target.ts` (used by `send`, `queue`, and the file navigator's open command), `sendMessage` in `src/agent/message-queue.ts`, and `resolveTargetAliases` in `src/monitor/targets.ts` each inline the same predicate: the typed name matches a tab's label or its `rename` alias (`title`), ignoring case. `resolveTargetTab` in `src/commands/schedule.ts` calls the exact, case-sensitive `managers.tab.byLabel` instead, so `schedule standup in Claude …` or `schedule list in <alias>` answers `No tab named "…"` while `send` and `monitor` accept the same name. The user documentation (`getting-started/tabs.md`) already promises that `schedule … in <tab>` matches the alias or the label ignoring case, so the code is what is wrong.

## Goal

One accessor, `byLabelOrAlias(tabs, name)` in `src/tab/lookup.ts`, answers the question for every user-typed tab reference. The three inline copies call it, and the `in <tab>` target of `schedule` resolves through it, storing the entry under the resolved tab's canonical label as it already does once it has the tab.

## Approach

`byLabelOrAlias` keeps the existing predicate and the existing first-match semantics of `find`: a tab whose alias equals another tab's label still resolves to whichever the array holds first. That is the shared behavior today and this change preserves it rather than fixing it.

The backlog entry also proposed a delegating `TabManager.byLabelOrAlias` method. `src/tab/manager.ts` already sits at 198 of its 200 counted lines, and a three-line delegate would push it over the limit, forcing an unrelated extraction into this change. Every call site already holds the tab array (`managers.tab.tabs`, or the `tabs` argument in the monitor helper), so each imports the plain function from `src/tab/lookup.ts` and passes that array. This also keeps the command test mocks — which stub `managers.tab.tabs` but no manager method — valid without edits, which the entry requires of `send.test.ts`, `queue.test.ts`, and `communication-manager.test.ts`.

In `schedule`, only a typed `in <tab>` target goes through the alias lookup. The default target is the issuing tab's own canonical label, which stays on exact `byLabel`: routing it through the alias lookup could land on an earlier tab whose alias happens to equal this tab's label. Error messages keep echoing the name the user typed.

## Implementation steps

1. `src/tab/lookup.ts`: add `byLabelOrAlias(tabs, name)` beside `byLabel`, lowercasing `name` and matching `t.label.toLowerCase()` or `t.title?.toLowerCase()`.
2. `src/commands/resolve-target.ts`: replace the inline `find` with `byLabelOrAlias(managers.tab.tabs, label)`.
3. `src/agent/message-queue.ts`: replace the inline `find` in `sendMessage` with `byLabelOrAlias(managers.tab.tabs, message.to)`.
4. `src/monitor/targets.ts`: replace the inline `find` in `resolveTargetAliases` with `byLabelOrAlias(tabs, target.label)` and drop the "mirrors" note from its comment.
5. `src/commands/schedule.ts`: in `resolveTargetTab`, resolve a typed target with `byLabelOrAlias(managers.tab.tabs, target)` and the default with `managers.tab.byLabel(own)`.

## Tests

- `src/tab/lookup.test.ts`: `byLabelOrAlias` finds a tab by exact label, by differently-cased label, by alias, by differently-cased alias; returns undefined for an unknown name; returns the first match when one tab's alias equals a later tab's label.
- `src/commands/schedule.test.ts`: scheduling into a tab by its alias stores the entry under the canonical label and confirms `in <label>`; a differently-cased label target resolves; `schedule list in <alias>` lists the target's entries.
- `src/commands/send.test.ts`, `src/commands/queue.test.ts`, `src/agent/communication-manager.test.ts`, and `src/monitor/targets.test.ts` pin the existing alias behavior and must pass unchanged.

## Spec

`product/specs/scheduling.md`: the `in <tab>` paragraph says the target may be a tab's label or its alias, matched ignoring case, with the entry stored under the canonical label. Fix the stale `src/schedule.ts` reference to `src/schedule/index.ts`.

## Out of scope

- Disambiguating an alias that collides with another tab's label; the shared first-match rule is preserved.
- Other exact-label lookups that receive a canonical label from the server or client rather than user-typed text.
- Tab-completion after `in`, which completes against labels only.
