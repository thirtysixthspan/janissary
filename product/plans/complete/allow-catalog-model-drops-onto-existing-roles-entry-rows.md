# Allow catalog model drops onto existing roles entry rows

**Complexity: 4/10** — one guard reorder in a 98-line drag module and the tests that pin it. The gesture machinery is already right for a flat zone list; what is wrong is that a nested zone ends a gesture it does not own. No contract, spec-level behavior, or server change; the behavior the tab already promises simply does not happen.

`dropOnEntry` reads the remembered drag, clears it, and only then asks whether the drag is a sibling entry reorder (`web/src/plugins/roles/roles-dnd.ts`). A drop that is not a reorder therefore ends the gesture and returns `null`. The entry row is nested inside the role card, so the drop event bubbles: the card's `onDrop` then calls `dropOnRole`, which reads a drag that is already `null` and returns `null` too. Nothing is raised.

That is the whole failure, and it needs no unusual gesture to hit. Drag `gpt-6-sol` from the catalog and let go anywhere over a role that already has entries — over the rows, which is where the pointer naturally is — and the card outlines itself as a compatible drop target, the drop highlight says yes, and no entry appears. The same path swallows a role grip dropped on another card's rows, which is the card-level reorder the plan settled on. The existing test suite cannot see it: the catalog test drops onto an *empty* card, where the row handler never runs.

## Goal

- Dropping a catalog model anywhere on a populated card adds the entry, including on an entry row and on the controls inside one — which is what the tab's own description, its spec, and its user documentation already promise.
- A row consumes a gesture only when the gesture is a sibling entry reorder. Every other drag reaches the card intact.
- One completed gesture raises one intent: a sibling reorder that stops at the row does not also reach the card.

## Design decisions

- **A zone ends a gesture only when it handles it.** `dropOnRole` and `dropOnCatalog` already do this correctly and stay as they are — the card is the outermost zone of the gesture, so nothing above it needs the drag, and leaving it holding a stale drag would leak into the next gesture. The row is not outermost, so it must not clear a drag it is passing up.
- **A handled reorder consumes the event.** `preventDefault` plus `stopPropagation` on the row stops the card's `onDrop` from running at all, rather than relying on it happening to ignore an entry drag. The reordering stays the row's own gesture and the card never sees it.
- **The dragover rules are already right and stay untouched.** The row still advertises a drop only for entry drags, and the card still advertises one for catalog and role drags; because both allow without stopping propagation, a catalog drag over a row is allowed by the card and a role drag is too. That is what makes the highlight appear over the rows today, and it is what will make the drop land there once the drop stops being eaten.
- **The card's handlers need no change.** `RoleCard`'s `onDrop` already raises only what it is handed, which is the correct shape once the row stops manufacturing a null. Leaving them untouched is deliberate rather than an omission.
- **No new gesture.** The `<select>` and the remove button inside a row are ordinary children, so a drop on either bubbles to the row and on to the card; the fix needs no per-control special case. The tests pin it so a future handler on those elements cannot quietly swallow the bubble.

## Implementation steps

1. **`web/src/plugins/roles/roles-dnd.ts`.** Rework `dropOnEntry` to read the remembered drag and answer `null` immediately unless it is an entry drag from the same role at a different position. Only on the reorder does it call `preventDefault`, call `stopPropagation`, clear the drag, and answer the `move-entry` intent. Update its comment to say that a drag the row does not handle belongs to the card around it.
2. **`web/src/plugins/roles/RoleCard.tsx`** — no change; recorded here so its absence is a decision rather than an oversight.
3. **Specs and documentation** — see below.

## Tests

`web/src/plugins/roles/roles-dnd.test.tsx`:

- A catalog model dropped on an entry row of a populated card raises exactly one `add-entry` for that role.
- A catalog model dropped on a row's effort dropdown and on its remove button raises the same single `add-entry`, pinning that a child's handler cannot swallow the bubble.
- A role grip dropped on another card's entry row raises `move-role` to that card's position, replacing the current test that expects a nested row to reject the drop.
- A role grip dropped on its own card's entry row raises nothing.
- A sibling entry reorder raises exactly one `move-entry` and no `add-entry` or `move-role` from the card behind it.
- An entry dropped on itself and an entry dropped on another role's entry each raise nothing.

## Out of scope

- Dropping an entry on card whitespace. Today that is a no-op and stays one: a reorder names a target position, and whitespace names none.
- The drag highlight's flicker when the pointer crosses between a row and the card around it. That is `onDragLeave` behavior, it predates this fix, and it is not what makes a drop silently do nothing.
- A cross-role entry drag. It is a no-op today and stays one.
- Anything on the server: no intent, guard, or file behavior changes.

## Verification

- `./scripts/run.mjs check-diff` is clean: lint, both typechecks, and the roles client tests.
- Manual check: open the roles tab, drag `gpt-6-sol` from the catalog onto an existing entry row of `planning` and confirm the entry is appended and the file gains it; drop the same model onto the row's effort dropdown and its × button and confirm it works there too; drag one entry row onto a sibling and confirm exactly one move happens rather than a move plus an append; drag `planning`'s grip onto the rows of another card and confirm the role moves to that card.