# Add Hosts create, rename and delete server intents

**Complexity: 6/10** — ~102 added production lines, 8 requirements and 20 test scenarios (p=5.782)

## Goal

Make the backend return precise modal outcomes and update the tab after each accepted edit. Source plan: `product/plans/complete/hosts-tab.md`. Depends on `product/plans/ready/hosts-tab-12-register-hosts-plugin.md`.

## Implementation

Extend the import-free `src/plugins/hosts/shared.ts` from plan 11 with `SaveHostIntent`, `DeleteHostIntent`, `SaveHostResult`, and their guards. Save carries `name`, `user`, `destination`, and `path` as strings, plus optional nonempty `originalName`. Allow blank field strings through the shape guard so the shared validator can give the form its field-specific error or normalize an optional blank. Delete carries a nonempty `name` string. `SaveHostResult` is `{ ok: true, name: string }` or `{ ok: false, error: string }`. Export `isSaveHostResult` for the client to narrow the reply it receives by requesting `unknown` through the generic `TabPluginClientCapabilities.intent` in `web/src/plugins/api.ts:214`.

Register `save` and `delete` in the Hosts activation's existing `defineIntents` table. Let `defineIntents` in `src/plugins/define-intents.ts:32` reject a bad request shape or report an invalid tab payload. Return the `SaveHostResult` directly from the Save handler for expected edit outcomes. The `pluginIntent` case in `src/message/plugin.ts` already forwards the handler's result, while `rejectRequest` in `src/plugins/context.ts:210` throws a request rejection. Keep the expected form errors in the returned result so they reach the inline error display.

Put the mutation rules in `src/plugins/hosts/host-edits.ts`. Reuse the project root and home lookup, catalog notification callback, and payload publication from plan 12. Pass each mutation through the synchronous read-modify-write entry point in `hosts-file.ts` from plan 2. Validate Save with the same `hosts-values.ts` field validator as `hosts add`. Resolve the original, requested delete, and replacement keys by the catalog's case-insensitive name equality against the fresh file in effect. Create refuses an occupied name. Edit may replace its own original key, including a case-only rename, in the same atomic write. A collision with another row returns `Host "<name>" already exists.` A stale edit or delete whose original row is gone returns `No host named "<name>".` Leave unrelated entries from the fresh file intact.

On a successful mutation, call `updateTab` once with the written catalog and its selected file path through the publication path from plan 12. Keep the published rows in the same folded-name order as a read. Leave the previous payload in place on any refusal or write failure. Save returns the saved spelling on success and the shared validation, duplicate, missing-host, unusable-file, or write diagnostic on failure. For Delete, send the failure diagnostic with `notifyUser(message, { tab: 'hosts' })` and return `null` for either handled outcome. This targets the Hosts instance key as in `src/plugins/context.ts:130`. The display keeps its row until it receives the server's updated payload. Neither handler changes existing sessions.

## Tests and verification

In `src/plugins/hosts/shared.test.ts`, cover Save and Delete guard shapes, optional edit identity, and both branches of the Save result. In `src/plugins/hosts/activate.test.ts`, cover create and create collision, same-name edit, case-only rename, rename collision, stale edit and stale deletion, successful deletion, and preservation of an unrelated entry added by hand after opening the tab. Check exact inline text for invalid fields, an unusable effective file and write failure, and check that a bad project override falls back to the usable home file. Assert that Delete posts failures against the Hosts instance, returns `null`, and retains the existing payload. Verify each successful mutation publishes the sorted written catalog exactly once, while invalid requests and failed mutations make no write or update. Update the backend behavior in `product/specs/hosts-tab.md`. Run `$janissary/scripts/run.mjs check-diff`. Send `save` and `delete` through the scratch plugin fixture and compare the reply, notification, Hosts payload, and resulting file.

## Out of scope

Modal layout and keyboard behavior.
