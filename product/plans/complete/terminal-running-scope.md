# Scope `terminalRunning` to the calling plugin's own terminals

**Complexity: 3/10** — one question on the pty manager, one call site, three cases.

**Goal.** `createPluginContext` answers `terminalRunning` with `managers.pty.isRunning(ptyId)` for whatever id the caller supplies, while the type comment in `src/plugins/api.ts` and the capability's own bullet in `documentation/developer-documentation/tab-plugins.md` both describe it as reporting on "a terminal this plugin spawned". Pty ids come from a plain counter, so a plugin can enumerate them and learn which other processes in the window are alive — and the answer widens by default the moment it carries anything more than a boolean.

**Approach.** The backlog entry proposes tracking the ids a plugin's factory received, in a `Set` beside the plugin record or a map inside `TabManager`. That is a second copy of a fact the host already holds: `PseudoterminalManager` records every session's owning `tabLabel`, and `adopt` is what puts a plugin tab's terminal on the label `addPluginTab` mints. So the answer is derived rather than tracked — `isRunningFor(ptyId, labels)`, true only when the session is registered *and* its owner is one of the labels given.

Deriving is what makes this correct rather than approximately correct. A tracked set has to be added to at the same moment the terminal is adopted and pruned when the tab closes, and a missed prune leaves an id answering `true` after its tab is gone; there is no test that can catch the difference between the two approaches except a case where a tab has closed, which is precisely the case the bug report is about. The derived answer cannot drift, because it is read from the same registry `closeTab` reaps.

`line-capabilities.ts` derives the labels from the plugin's own open tabs, so the question asked is "is this one of mine", which is the question the type comment claims to answer. The factory is the only scope in which a plugin may start a process, so nothing legitimate is refused: a plugin cannot learn an id any other way.

## Implementation

1. `PseudoterminalManager.isRunningFor(ptyId, labels)` beside `isRunning`, which stays for the host's own callers and keeps its wider contract.
2. `terminalRunning` in `src/plugins/line-capabilities.ts` collects the labels of the plugin's open tabs and asks through it.

## Tests

In `src/plugins/shell-capabilities.test.ts`, the existing `terminalRunning` describe block becomes the enforcement's: the id the plugin's own factory received answers truthfully, an id belonging to a tab of another plugin answers `false`, and a disabled plugin still answers `false`. The second fails today.

`src/plugins/shell/activate.test.ts` stubs the capability object and keeps passing untouched.

## Documentation

None needed, and deliberately so: `documentation/developer-documentation/tab-plugins.md` already says the capability "answers whether a terminal **you spawned** is still running", which is the behaviour that lands. Correcting a document to match a fix that was already written correctly would be the reverse of what this backlog entry is for.

## Out of scope

- Scoping `isRunning` itself. The host's own callers — `handleExit`, `closeAll`, the connections panel — legitimately ask about any id, and narrowing it would change what they can see.
- Opaque pty ids. Randomising the counter would stop enumeration at the source and is a larger change to `src/pty.ts` with its own persisted-state considerations; the capability is the narrower place to close this, and closing it there also covers a plugin that was handed an id by another tab.