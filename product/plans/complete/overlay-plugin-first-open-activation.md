# Overlay plugin first-open activation

**Complexity: 5/10** — one routing table moves from "what has loaded" to "what was declared", which touches two
source modules and the tests that publish into them, and nothing about the extension point's shape changes.

## Summary

The overlay-plugin seam routes a chord or a command word by scanning `registrations`, and the only writer to
`registrations` is `registerContributedOverlay`, which `web/src/overlay-plugins/host.ts` calls from inside
`activate`. `activate` is reached from the opener the seam invokes *after* a claim has already resolved. So the first
request finds no claim, returns false, and never loads the chunk: `Ctrl+Shift+V`, the `clip` command word, and
`Paste from clipboard…` all do nothing the first time they are used, with nothing reported, because the plugin was
never disabled — it was never reached.

The host already knows the answer before loading anything: `pluginForChord`, `pluginForCommand`, `accepted`, and
`disabled` exist for exactly this and have no production caller at all, referenced only from `host.test.ts`.

The fix is to give the seam the two facts separately, because they arrive at different times and come from different
parties: a **declaration** says how a plugin will be reached and exists from construction, while a **registration**
carries the overlay itself and exists only once the chunk has loaded.

## Design decisions

### Routing belongs to the declaration, not to the registration

`claimForChord` and `claimForCommand` will scan a declarations map the host publishes at construction. A registration
no longer carries claims at all.

This is preferred over letting a registration keep its claims alongside an earlier declaration of the same claims,
because two copies of one fact is the drift the seam exists to prevent — and because the plugin layer's own comment
already says the claims come from the declaration, not from the plugin. Making the signature
`registerContributedOverlay(overlay)` states it.

The seam still answers a claim before the overlay exists, which is the whole point. The opener is what loads the chunk
and only then calls `openContributedOverlay`, so a claim can never route to an overlay that fails to register: the
registration always happens first, inside `activate`, before the open.

### A declaration does not bump the version

Publishing or withdrawing a claim changes nothing that is rendered: the registry's answer is built from
`registrations` through `contributedOverlays()` and `contributedOverlayClaimsCommandBar()`, and neither consults
claims. Notifying would re-render the shell for no visual change, so `declareOverlayClaims` does not notify. This
keeps `contributedOverlaysVersion` meaning what its comment says — something registered, opened, or closed.

### The four unwired host methods go

With the host publishing declarations itself, `pluginForChord` and `pluginForCommand` have no remaining caller: the
question is answered by what the host published, and a feature asks the seam rather than the host. `accepted` and
`disabled` have no caller either. All four come off `OverlayPluginHost` rather than being left as a public surface
with no user — the host's internal `live()` already computes everything it needs.

## Proposed changes

### 1. `web/src/shared/contributed-overlays.ts`

- Add a `declarations: Map<string, OverlayClaims>` beside `registrations`.
- Add `declareOverlayClaims(name, claims)`, returning a withdrawal that leaves a later declaration for the same name
  in place, matching how `registerContributedOverlay`'s removal already behaves.
- Drop `claims` from `Registration` and from `registerContributedOverlay`'s parameters.
- Point `claimForChord` and `claimForCommand` at `declarations`.
- `openOverlayForChord`, `openOverlayForCommand`, `overlayClaimedByCommand`, `openContributedOverlay`, and every
  projection are otherwise unchanged.

### 2. `web/src/overlay-plugins/host.ts`

- Keep the refusals (`validateDeclarations`, `claimedByCore`) running first, so a plugin refused for a reason never
  publishes a claim.
- After the refusals, publish a declaration's claims for every plugin still live, holding each withdrawal.
- Withdraw them in `disable` and in `dispose`, so a plugin disabled for a failed load or a core-chord collision stops
  answering its chord and command word immediately.
- `activate` calls `registerContributedOverlay` with the overlay alone.
- Remove `pluginForChord`, `pluginForCommand`, `accepted`, and `disabled` from the returned type.

### 3. Call sites that publish into the seam

`web/src/useWindowKeys.test.ts`, `web/src/pickers/overlay-registry.test.ts`,
`web/src/agent-tabs/command-input/useCommandBarSubmit.test.ts`, and `web/src/shared/contributed-overlays.test.ts`
each call `registerContributedOverlay` with a `claims` argument. They now call `declareOverlayClaims` for routing
where the test needs a claim, and register the overlay alone.

## Tests

In `web/src/shared/contributed-overlays.test.ts`:

- A declared claim answers a chord and a command word **before** any overlay is registered, and the opener receives
  the name — the order that is broken today.
- Withdrawing a declaration stops it answering.
- A later declaration for the same name survives an earlier one's withdrawal.
- Two plugins declaring one chord resolve in declaration order.
- `openOverlayForCommand` returns false when nothing declared the word.

In `web/src/overlay-plugins/host.test.ts`:

- **The real order end to end**: a constructed host answers `openOverlayForChord` for its declared chord, which drives
  the opener, which activates and opens, with the loader called once and the overlay on screen. This is the case no
  current test exercises.
- A plugin disabled after construction — by a throwing load, a module exporting no overlay, a refused declaration, or
  a chord the application already uses — stops answering its chord and command word, so a stale claim cannot route to
  a plugin the host has given up on.
- `dispose` withdraws claims, so a disposed host answers nothing.
- The existing refusal, budget, disable-reason, close-capability, and throwing-dispose coverage is kept and its
  assertions move from the removed methods to the seam.

`web/src/overlay-plugins/host.test.ts` currently passes its declarations through `declarations: [...] as never`; that
cast stays, since the option type is the registry's readonly tuple.

## Out of scope

- The host being rebuilt on every render, which disposes the history — recorded separately.
- A second concurrent `activate` calling `start` twice — recorded separately.
- The reserved-chord list duplicating the core bindings — recorded separately.

## Verification

- `./scripts/run.mjs check-diff`.
- `./scripts/run.mjs pr-check-gate`.
