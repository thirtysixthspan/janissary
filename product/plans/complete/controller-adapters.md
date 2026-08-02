# Feature-specific controller adapters

**Complexity: 8/10** — the controller facade crossed tabs, monitors, editors, and file navigation,
so extraction had to preserve RPC method signatures and manager wiring.

## Goal

Keep `Controller` as an orchestration boundary while placing feature-specific RPC forwarding in
small adapters.

## Implementation

- Added tab, monitor, editor, and file-navigator adapter modules.
- `Controller` composes those adapters in its constructor and declares the public RPC surface,
  preserving the existing callers and protocol behavior.
- Left lifecycle, state, transcript, and shutdown orchestration on `Controller`.

## Verification

`npm run typecheck:diff`, `npm run lint:diff`, and `./scripts/run.mjs check-diff` pass.
