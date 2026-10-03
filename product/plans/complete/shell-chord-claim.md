# Shell tab: take its chord claim from the tab wire view

**Complexity: 4/10** — one read-only field on the client capability object, sourced from a field the host already sends, plus a stability fix in the hook that consumes it.

**Goal.** Have one copy of the chord claim instead of two. The host validates `chords` at activation and now sends it on every tab view, but nothing on the client reads it and the shell body keeps its own literal — so the claim the host enforces and the claim the client honours are independent and can diverge silently.

**Approach.** Carry the claim on the capability object, which is already how the other half of the rule — whether the tab is visible — reaches a plugin body. The value is taken from the wire view rather than from the declaration, so it is whatever activation accepted. Because that view is rebuilt on every state broadcast, the hook that registers claims must not depend on the array's identity.

## Implementation

1. Add a read-only `claimedChords` to `TabPluginClientCapabilities` in `web/src/plugins/api.ts`, and a parameter to `createPluginClientCapabilities` supplying it.
2. In `web/src/plugins/PluginBody.tsx`, pass `plugin.chords` from the wire view it already receives, defaulting to none. This is host data, so nothing new crosses the wire.
3. In `usePluginChordClaims` in `web/src/plugins/PluginChords.tsx`, derive the effect's dependency from the ids' joined form rather than the array's identity, so a fresh array per broadcast does not unregister and reregister the claim between two keypresses.
4. Delete `CLAIMED_CHORDS` from `web/src/plugins/shell/ShellTab.tsx` and read the capability instead.

## Tests

- `web/src/plugins/shell/ShellTab.test.tsx`: a claim that differs from the manifest's is honoured, proving nothing client-side overrides it; a tab whose wire view names no chord claims nothing, which is the case the old constant made impossible.
- `web/src/plugins/PluginChords.tsx` has no test file of its own; the claim-lifecycle cases live in `web/src/plugins/shell/ShellTab.test.tsx` and `web/src/useWindowKeys.test.ts`, both of which must keep passing.

## Out of scope

- Any server change. `src/tab/view.ts` already populates the field and `validateDeclaration` already refuses a malformed id; this only stops the client ignoring them.
- The `web/src/plugins/fixture-v1` round trip, which is unchanged: the new field is optional and a fixture that omits it is unaffected.