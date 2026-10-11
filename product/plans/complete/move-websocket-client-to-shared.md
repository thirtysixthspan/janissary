# Move the websocket client into the shared layer

**Complexity: 8/10** — this moves a central client and its collaborators, updates its broad importer set, and adds a previously unenforced layer boundary. Proceeding under the user's complexity override.

## Goal

Make the websocket client and its feature-neutral collaborators part of `web/src/shared/`, so shared modules do not depend upward on the app-shell root.

## Approach

Move the client, connection, RPC, URL, reconnect, PTY buffer, client-state collector, and notification-event listener modules into `web/src/shared/ws/`. Retarget all consumers, including the seven existing shared consumers and modules that import helper types or functions directly. Add an ESLint zone that prevents shared modules from importing app-shell root files while allowing imports within `shared/`.

## Implementation steps

1. Move the websocket client and each feature-neutral collaborator into `web/src/shared/ws/`, including the notification listener implementation currently nested under `toasts/`, and retarget every importer of the moved modules.
2. Extract the client feature-zone definitions into `eslint.client-feature-zones.mjs` to keep `eslint.config.mjs` under the 200-line limit, then add a shared-to-app-shell-root restriction that excludes shared and feature subtrees already covered by dedicated zones.
3. Add boundary tests that reject a shared-to-root import and allow a shared-to-shared import; run the existing websocket and collaborator tests unchanged.

## Tests

- Assert a shared module importing a root module is rejected by the ESLint boundary.
- Assert a shared module importing another shared module remains allowed.
- Run the websocket client and collaborator test suites, then `./scripts/run.mjs check-diff`.

## Out of scope

- Changing websocket behavior, protocol handling, reconnection policy, or toast behavior.
- Moving app-shell components or feature-owned toast UI into `shared/`.
