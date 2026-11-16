# Keep a docked file navigator docked when a reveal activates it

**Complexity: 2/10** — ~2 added lines in 1 production file, 3 requirements, 2 test scenarios (p=3.50).

## Goal

`revealEditorFile` ends by calling `TabManager.setActiveTab` on the navigator it just revealed. That call is meant to bring a centre-strip navigator to the front and leave a docked one alone, because `setActiveTabOp` returns early for a tab carrying `dock`. But `TabManager.setActiveTab` (`src/tab/manager.ts:170`) delegates to `tabOperations.setActiveTab` (`src/tab/operations.ts:32`), whose first step is `revealTab` (`src/tab/visibility.ts:39`). For a tab carrying `dock`, `revealTab` calls `applyDock(..., null, ...)`, clearing the dock and making the tab the active centre tab before `setActiveTabOp`'s guard is reached. So a reveal from the default docked navigator pulls it out of the sidebar and covers the editor the user was working in.

The fix puts the dock check in `revealEditorFile`, where the placement is still visible, and leaves the tab manager's undock-on-activate behavior alone.

## Design decisions

- **Guard before the call, not inside it.** `setActiveTab` must keep undocking a docked tab; that is how an explicit focus brings one to the centre, and `src/tab/operations.test.ts` and `src/tab/manager.test.ts` already cover it. The reveal is the one caller that wants the opposite, so the decision belongs here.
- **Compute the index once.** The index is needed for both the dock lookup and the activation, so store `const index = port.managers.tab.findIndex(label)` and use it for both instead of calculating it inline at the call.
- **Activate only an undocked navigator.** `port.managers.tab.tabs[index]?.dock === undefined` covers the centre-strip case and the missing-tab case: an index of `-1` yields `undefined`, and the resulting `setActiveTab(-1)` is already a no-op in `revealTab`. A navigator carrying any dock is left where `openOrRetargetLocalAt` put it.
- **The rest of the reveal stays unconditional.** Expansion, the restore hint, and the rebuild run for a docked navigator exactly as before; only the final activation is guarded.

## Proposed changes

`src/file-navigator/reveal-editor.ts` — replace the final activation with:

```ts
const index = port.managers.tab.findIndex(label);
if (port.managers.tab.tabs[index]?.dock === undefined) port.managers.tab.setActiveTab(index);
```

`src/file-navigator/reveal-editor.test.ts` — the `revealFixture` fake records calls to `setActiveTab` without doing what the real one does. Make the fake mirror the real undock: delete `tabs[index].dock` when called, with `vi.fn` still recording the call. Expose `tabs` from the fixture so the docked case can assert its placement. Replace the last case, "activates the navigator index in the centre strip and when it is docked", with two assertions in one case:

- centre strip: `setActiveTab` called exactly once with `1`;
- docked left: `setActiveTab` not called, `tabs[1].dock` still `'left'`, and the hint and expansion still written.

Because the fake now undocks on any call, the docked assertions fail if the production guard is removed.

No port or type change is needed: `RevealPort` already carries `managers`, and `TabManager.tabs` is public.

## Tests

- `revealEditorFile` activates a centre-strip navigator: `setActiveTab` called exactly once with its index.
- `revealEditorFile` leaves a docked navigator docked: `setActiveTab` not called, `tabs[1].dock` still `'left'`, `state.expanded` holds both ancestors, and `state.restore` names the file.
- The existing reveal cases (unknown label, non-editor label, blocked editor, missing root) keep asserting `setActiveTab` was not called; the fixture's undock does not change their outcomes.
- `src/tab/operations.test.ts` and `src/tab/manager.test.ts` keep passing unchanged; they own the undock behavior the fake doubles.

## Out of scope

- `TabManager.setActiveTab`, `revealTab`, `applyDock`, and their tests. Undocking an explicitly focused docked tab stays as it is.
- The sidebar host's selection of a docked navigator from a focus hint, which later subplans own.
- Any port, protocol, RPC, or client change.
- Specs, help, and user documentation: the reveal is not yet documented, and this restores the docked behavior the feature plan already promises.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- `npx vitest run --project server src/file-navigator/reveal-editor.test.ts src/file-navigator/open.test.ts`
- Read the diff to confirm the only activation is the guarded call and that a docked reveal leaves `dock` untouched.
