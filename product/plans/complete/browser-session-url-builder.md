# Centralize browser session-token URL construction

**Complexity: 4/10** — one focused browser helper, three call-site delegations, and focused tests. The public resource URL capability and the endpoint output stay unchanged.

## Goal

All browser requests that need the page session token use one owner for reading, encoding, and placing that token. Resource requests continue to produce `<reference>?token=<encoded token>`, and WebSocket connections continue to produce `ws://<host>/?token=<encoded token>`.

## Approach

Add a small browser-only URL module under `web/src/`. It will read the current page token once per call and expose separate resource and WebSocket builders, keeping the intentionally different bases explicit. `JanusClient`, plugin capabilities, and `SocketConnection` delegate to it without changing their existing public contracts.

## Implementation

1. Add `web/src/session-url.ts` with builders for authenticated resource and WebSocket URLs. Preserve the empty-token parameter and percent encoding used today.
2. Replace the duplicated resource URL construction in `web/src/ws.ts` and `web/src/plugins/api.ts` with the resource builder.
3. Replace `SocketConnection`'s inline WebSocket URL construction with the WebSocket builder.
4. Add a colocated helper test covering encoded tokens, no-token output, and the WebSocket URL shape. Retain the existing client and plugin delegation tests as boundary coverage.

## Tests

- `web/src/session-url.test.ts`: verifies both URL types carry an encoded page token and resource URLs retain an explicit empty token when absent.
- Existing `web/src/ws.test.ts` and `web/src/plugins/api.test.ts`: continue to verify their public `resourceUrl` boundaries.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and before shipping.

## Specs and documentation

No functional-spec, `help.md`, or public-documentation update is needed. This is an internal consolidation that preserves every observable URL and documented capability.

## Out of scope

- Changing session authentication, endpoint paths, URL query semantics, or public plugin/client APIs.
- Generalizing the helper for server-side URL construction.
