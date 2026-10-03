# Adopt and release every terminal a payload factory starts

**Complexity: 5/10** — one array instead of one id, plus one guard on the path where no tab was created. Contained to `src/tab/openers.ts` and its tests.

**Goal.** Make `spawnTerminal` safe to call more than once. Today `withResources` returns `terminals[0]`, so a second terminal in the same factory keeps the empty label it was spawned with and belongs to no tab — nothing releases it, and the tab's connection list never shows it.

## Approach

Return every id the factory started and adopt each onto the tab that was created. No other guard is needed: `openPluginTab` de-dupes on plugin id plus instance key *before* the factory runs, so by the time `addPluginTab` is reached no tab can already hold that key, and the tab found afterwards is always the one just minted. That path was checked rather than assumed — the early return at the top of `openPluginTab` means the factory never runs for an already-open instance key, so no process is started for a tab that will not exist.

## Implementation

1. In `src/tab/openers.ts`, have `withResources` return the whole `terminals` array.
2. In `openPluginTab`, adopt every id onto the tab found for this plugin id and instance key.
3. In `updatePluginTab`, adopt every id onto the tab it found, which exists by construction.
4. Leave the throw path as it is: it already kills everything the factory started.

## Tests

In `src/tab/manager.test.ts`:

- a factory that starts two terminals has both adopted onto its tab, so one `closeTab` releases both;
- an already-open instance key starts no second process at all, pinning the de-dupe that makes the
  adoption unconditional;
- the existing single-terminal, throwing-factory, and stashed-resources cases keep passing untouched.

## Out of scope

- Any limit on how many terminals one factory may start. The guard is about ownership, not quantity.
- The `TabPluginTerminal` payload shape. A plugin still learns one id per call, which is the right granularity for a plugin that wants to address a specific terminal.