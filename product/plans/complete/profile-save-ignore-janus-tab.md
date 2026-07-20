# `profile save` should ignore the root janus tab

**Complexity: 2/10** — a single guard clause in an existing switch branch, plus a test and a spec sentence. No new types, no cross-cutting changes.

## Goal

`profile save <name>` currently captures every tab in `managers.tab.tabs`, including the root `janus` tab that every session auto-creates on startup (`TabManager`'s constructor always makes `tabs[0]` a `janus`-labeled agent tab, `src/tab/manager.ts:53-54,254-258`). That root tab has `view === undefined`, so it falls into the ordinary agent-entry branch of `captureTab` (`src/profile/save-route.ts:27-32`) and gets written as `janus.json`, counted in the summary's agent count. Since every session already creates its own root `janus` tab on startup, this saved entry is redundant at best — it should simply be left out of the capture, the same way the ssh case is already left out for a different reason.

## Approach

Identify the root janus tab precisely by position **and** label — `tab === managers.tab.tabs[0] && tab.label === 'janus'` — rather than by label alone. Matching on label alone would risk excluding a tab a user later renamed to "janus" (tabs can be renamed via `TabManager.renameTab`, `src/tab/manager.ts:219`), which is not what "ignore the janus tab" means. Requiring it to also be the first tab keeps the guard scoped to the actual auto-created root tab.

Unlike the ssh skip (which reports the tab as "skipped" because it's a genuinely unrepresentable tab type), the janus root tab is an ordinary, representable agent tab that we're deliberately excluding by convention — it isn't something the user should be told was "dropped." So it is left out silently: not counted in `state.agents`, not pushed to `state.skipped`.

## Implementation steps

1. In `src/profile/save-route.ts`, at the top of the `case undefined: case 'agent':` branch, add:
   ```ts
   if (tab === managers.tab.tabs[0] && tab.label === 'janus') return;
   ```
   before the existing `writeAgentEntry`/`state.agents += 1` lines.
2. Run `./scripts/run.mjs check-diff`.

## Tests

Add to `src/profile/save.test.ts`, alongside the existing skip test:

- `'does not capture the root janus tab, and does not count or report it'` — build a tab list where `tabs[0]` is `makeTab('janus', ...)` followed by an ordinary agent tab (e.g. `bob`). Assert `loadProfileEntries('demo')` contains only the `bob` entry, `summary.agents` is `1`, and `summary.skipped` does not include `'janus'`.
- `'captures a tab labeled janus if it is not the first tab'` — build a tab list where `tabs[0]` is an ordinary tab and a later tab happens to be labeled `janus` (simulating a renamed tab). Assert the `janus`-labeled entry is captured normally (present in `loadProfileEntries`, counted in `summary.agents`).

## Spec updates

`product/specs/profiles.md`, `### profile save <name>` section: the second sentence of the first paragraph currently reads "Every open tab is captured, including the tab the command was typed in (unlike `profile launch`, which never touches its own issuing tab)." Add a clause carving out the root janus tab as the one exception.

## Out of scope

- Any change to `profile launch`, `profile list`, or how the root janus tab is created.
- Adding a structural `isRoot`/`kind` flag to `Tab` — position + label is sufficient and matches the existing ssh-skip style (matching on a runtime property, not a new schema field).
- Handling the case where a user closes the root janus tab and later creates a new first tab also labeled `janus` by coincidence — out of scope; the position+label check treats that as the root tab, which is an acceptable, harmless edge case (that tab would be skipped from capture, same as the real root tab would be).

## Verification

- Run `./scripts/run.mjs check-diff` after the change and after the tests.
- Manual check: launch the app (creates the root `janus` tab), open one more agent tab, run `profile save demo`, confirm `profiles/demo/` contains only the second agent's entry file and no `janus.json`, and the summary's agent count is 1 with nothing about janus in "Skipped".
