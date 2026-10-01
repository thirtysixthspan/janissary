# Derive the reserved-chord list from the chords the application owns

**Complexity: 5/10** — one new shared table, one lookup replacing a hand-maintained list, and the key handler's two
opener functions rerouted through it. No behavior changes; the point is that behavior and reservation stop being two
lists that can disagree.

## Summary

`claimedByCore` in `web/src/overlay-plugins/chords.ts` answers "does the application already own this chord?" by
re-listing the bindings the window key handler dispatches. The two lists are separate copies of one fact with nothing
keeping them in step, and they have **already drifted in both directions**:

- **Cmd+T is missing.** `handleChordKeys` in `web/src/useWindowKeys.ts` opens a new agent tab on it, so a plugin
  declaring `cmd+t` is accepted at construction, then silently shadowed at runtime — the exact failure
  `claimedByCore` exists to prevent.
- **Shift+Tab is over-claimed as a global chord.** Nothing in `useWindowKeys` dispatches it. It is claimed
  *contextually*, by `useSectionNav`, and only when the key lands inside an element marked `data-claims-shift-tab`. A
  plugin wanting it is refused for a binding that would not have fired anyway.

A second copy of a fact that is already wrong in two places is worth deleting rather than patching.

## Design decisions

### One table of owned chords, with an owner field

`web/src/shared/app-chords.ts` declares every chord the application owns, keyed by the canonical chord id, valued by an
action and by **which module dispatches it**. Two consumers, one source:

- `useWindowKeys` routes on the action for the chords it dispatches.
- The overlay-plugin host asks the same table whether a chord is reserved, whatever dispatches it.

The owner field is what lets Shift+Tab be reserved honestly: it is in the table because the application does own it,
and its owner says the section navigator claims it rather than the window handler. This also has to live under
`web/src/shared/`, because the feature-directory lint zones forbid `useWindowKeys` importing the plugin layer and the
plugin layer's boundary rules would otherwise stop it importing a feature.

### Exhaustiveness comes from the type, not from a test

`useWindowKeys` switches on the action rather than on raw key and modifier comparisons, and its default branch narrows
to `never`. An action added to the table without a behaviour case is therefore a **compile error**, which is the
guarantee a test cannot give: a test would have to re-state the list it is checking, and would drift the same way.

For the chords another module dispatches, the switch says so explicitly and returns false — "not mine" — rather than
being silent about them.

### Fix the drift while the duplication is being removed

Cmd+T enters the table and Shift+Tab's owner becomes explicit, so both inaccuracies go with the refactor rather than
surviving it.

## Proposed changes

### 1. `web/src/shared/app-chords.ts` (new)

- `AppChordAction` — the union of what an owned chord does.
- `APP_CHORDS` — id → `{ action, owner }`, covering `ctrl+r`, `ctrl+g`, `ctrl+e`, `ctrl+a`, `meta+f`, `meta+shift+f`,
  `meta+p`, `meta+t`, and `shift+tab`.
- `appChordAction(id)` — the lookup, using `Object.hasOwn` so a chord id like `constructor` cannot resolve through the
  prototype.
- A comment saying the canonical id shape comes from `overlay-plugins/chords.ts` and that the plugin family may not
  import this module, which is why the ids are written out rather than derived.

### 2. `web/src/overlay-plugins/chords.ts`

- `claimedByCore` becomes `appChordAction(overlayChordId(chord)) !== undefined`, and the four-branch hand-written
  matching disappears.

### 3. `web/src/useWindowKeys.ts`

- Import `appChordAction`.
- `ctrlChordOpener` becomes a switch on the action for the four Ctrl chords, replacing the key-by-key switch.
- `metaChordOpener` becomes a switch on the action, keeping the existing per-chord bodies verbatim — the
  `snap.canSearch` and `searchOpen` conditions, the two `f` chords' ordering, and every `preventDefault` stay as they
  are.
- `handleChordKeys`'s trailing `meta+t` check moves into the switch, since it is now a table entry.
- The default branch narrows to `never`, and Shift+Tab's action is declined with a comment naming `useSectionNav`.

### 4. `web/src/overlay-plugins/registry.test.ts`

- Add Cmd+T to the reserved-chord cases, since it is the drift this change fixes.
- Keep Shift+Tab reserved, with the reason updated to name the contextual claim rather than implying a global one.

## Tests

- `web/src/overlay-plugins/registry.test.ts` — the reserved set, now including Cmd+T, and a chord nothing claims.
- `web/src/useWindowKeys.test.ts` — every existing core-chord case must pass **unchanged**. That file already dispatches
  Ctrl+R, Ctrl+G, the two `f` chords, Cmd+P, and the Tab-navigation chords and asserts the callbacks, so it is the
  behavioural proof that rerouting the handler changed no chord's meaning.
- Add to `web/src/useWindowKeys.test.ts` a Cmd+T case, which is a chord the handler dispatches and no existing test
  covers.

## Out of scope

- `ctrl+arrow` and Shift+arrow tab moves, which `handleTabShortcuts` dispatches and which are already excluded from
  plugin chords by the plugin contract's own rules; adding them to the table is a separate decision about whether an
  arrow chord is claimable at all.
- Rewriting the key handler's structure beyond the chord routing this entry touches.

## Verification

- `./scripts/run.mjs check-diff`.
- `./scripts/run.mjs pr-check-gate`, including the boundary tests the shared module's location must satisfy.
