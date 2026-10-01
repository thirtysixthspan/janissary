# Guarantee an overlay plugin's `start` runs once per activation

**Complexity: 4/10** — an in-flight promise keyed by plugin name, its clearing in two existing paths, one contract
sentence, and one test.

## Summary

`activate` in `web/src/overlay-plugins/host.ts` guards against registering twice with `unregisters.has(plugin)`. That
check runs **before** the first `await`, and both the load and the registration happen **after** it. Two openers firing
before the chunk resolves therefore both pass the guard, both await the same memoized load, and both call
`loaded.start(...)` followed by `registerContributedOverlay(...)`.

Consequences: the plugin's lifecycle hook runs twice, and the second return value overwrites the first in the
`unregisters` map, leaving the first unregistration function unreferenced — so `disposePlugin` can only ever call one
of them.

The clipboard-history plugin happens to be idempotent (`startHistory` returns early when already subscribed), which
is why nothing is visibly broken today. Nothing in `OverlayPluginModule` asks a plugin to be idempotent, and a plugin
that subscribes in `start` without its own guard leaks the first subscription for the session.

## Design decisions

### One in-flight promise, not a boolean

The load is already memoized through the `loading` map, which is what makes both callers await the *same* module.
Extending that idea to activation itself — an `activating` map holding the whole attempt, not just the load — is
smaller than a separate guard flag and cannot drift from the load memo, because it wraps it.

The second caller awaits the first attempt and returns its result, rather than starting a second one. That is the
whole fix.

### Clearing it matters more than adding it

A promise cached in a map outlives the thing it describes. `disable` already clears `loading` so a plugin disabled
mid-load is not resurrected by the in-flight load; the activation cache needs the same treatment in the same places,
or a plugin disabled during a slow chunk fetch would register an overlay moments after the host gave up on it.

### State the guarantee where plugin authors read it

The fix is only half the change. `api.ts` documents `start` and `OverlayPluginModule`, and a plugin author has no
reason to write an idempotence guard unless the contract says the call happens once. The sentence goes there rather
than only in the host.

## Proposed changes

### 1. `web/src/overlay-plugins/host.ts`

- Add an `activating: Map<string, Promise<boolean>>` beside `loading`.
- `activate` returns the cached promise when one exists for that plugin; otherwise stores the attempt.
- Clear the entry in `disable` and in `dispose`, alongside `loading`.
- Keep `unregisters.has(plugin) { return true; }` — it still short-circuits the common already-open case without
  touching a promise.

### 2. `web/src/overlay-plugins/api.ts`

- Say in `start`'s documentation that the host calls it once per activation and that a second `activate` for a
  loading plugin joins the first rather than starting a second one, so a plugin does not need to guard against it.

### 3. `web/src/overlay-plugins/host.test.ts`

- Call `activate` twice without awaiting the first, then assert `start` was called **once**, the loader ran once, and
  exactly one registration is on the seam.
- Assert the second call resolves to the same boolean the first does, so a join cannot report a different outcome.

## Tests

All in `web/src/overlay-plugins/host.test.ts`. The existing disable-on-throw, budget-overrun, exports-no-overlay,
refused-declaration, close-capability, and throwing-dispose cases must pass **unchanged** — this entry adds a cache,
and a cache that changes those outcomes would be worse than the bug.

## Out of scope

- What happens if a plugin's `start` returns different overlays on two calls. That cannot happen once `start` is
  called once.
- The equivalent guard in the editor-plugin and tab-plugin hosts, which are separate families this entry does not
  read.

## Verification

- `./scripts/run.mjs check-diff`.
- `./scripts/run.mjs pr-check-gate`.
