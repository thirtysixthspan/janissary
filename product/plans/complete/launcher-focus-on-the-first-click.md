# Focus a launcher tab row on the first click

**Complexity: 3/10** — one click rule for one list, two client tests, and two server tests for the route it already takes.

`LauncherTabRowView` routes tab clicks through `openOnConfirm`, the two-click rule: the first click on a row only moves the highlight, and the row opens on the second click of an already-highlighted one. That rule is right for the command rail — a rail that fired while the user was still reading down the list is the reason it exists — and it is wrong for the tab list, which promises navigation. `product/specs/launcher.md` says a row focuses the tab "the same way clicking it in the strip does", and the strip takes one click. So a user clicks a row to look at a tab, stays on the tab they were on, and the unread dwell that click is supposed to start never begins.

## Goal

One click on a launcher tab row focuses it, and a click on the row that is already focused does not send a second request.

## Approach

1. **`web/src/plugins/launcher/LauncherTabRowView.tsx`** answers a click with its own rule beside the rail's: the row is selected and opened, and a repeat click on the row already confirmed is not sent again, because it is already focused. `rowClicked` keeps doing the selection bookkeeping — the highlight, the focus handoff, the confirmation drop on navigation — so nothing about keyboard behaviour moves.
2. `CommandRail` keeps `openOnConfirm`. The two lists ship two rules because they promise two things, and the rail's is documented in its own module.
3. Nothing client-side clears unread. The click sends the `focus-tab` intent, `actOnTabs` in `src/plugins/topics.ts` resolves it to `setActiveTab`, and that route owns the dwell and its refusals — a label with no open tab, and a docked one.

### Rejected alternatives

- Making the rail single-click too. A rail runs commands; a list is navigated. The rail's rule is separate and deliberate, and the plan records it.
- Clearing the unread flag in the client when a row is clicked. The dwell is the server's, it has a duration, and a client-side clear would show the flag gone while the server still holds it.
- Sending the focus on every click, repeats included. A second request for a tab that is already focused is a no-op the server has to answer, and the row cannot tell the difference.

## Implementation steps

1. Replace the tab row's click rule.
2. Extend the client tests.
3. Add the `tabs` focus cases to `topics.test.ts`.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: one click on a tab row sends exactly one `focus-tab` intent; a second click on the same row sends none.
- `src/plugins/topics.test.ts`: the `tabs` topic's focus action makes the named tab active, and does nothing for a label with no open tab — the closed-target case, which is what a row that closed between the click and its answer hits.
- Keyboard activation stays where it is: arrows move the highlight and Enter focuses the highlighted row.

## Spec updates

- None. `product/specs/launcher.md` already promises single-click focusing and the completed plan already says the rail is the two-click list.

## Out of scope

- The rail's two-click confirmation, which is its own documented rule.
- The dwell's length, or what happens when the focus target is docked: `setActiveTab` owns both already.
