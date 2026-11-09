# Align the Commands client registry with payload schema version 1

**Complexity: 1/10** — one literal in the client plugin registry.

The earlier fix that returned `COMMANDS_PAYLOAD_SCHEMA_VERSION` to 1 left the client registry's duplicated literal at 2. The host therefore refused the Commands tab with `payload schema 1 is not supported; expected 2` and disabled the plugin.

## Goal

Make the client registration expect the same payload schema version the server declares, so the Commands tab opens.

## Approach

1. Set the `commands` entry in `web/src/plugins/registry.tsx` to `clientPlugin(1, ...)`. The registry deliberately duplicates the literal so the entry bundle does not import plugin guards.
2. `registry.test.tsx` already pins the literal against `COMMANDS_PAYLOAD_SCHEMA_VERSION`, so it fails if the two drift.

## Tests

- `registry.test.tsx`: the commands registration's schema version equals the shared constant (existing assertions now pass; they failed against the stale literal).

## Out of scope

- Any change to the payload shape or the registry's duplication design.
