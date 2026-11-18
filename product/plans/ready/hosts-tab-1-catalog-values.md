# Decode saved host names and fields

**Complexity: 4/10** — ~105 added production lines, 7 requirements and 14 scenarios (p=5.105)

## Goal

Give every Hosts surface one validation rule and one normalized host representation. Source plan: `product/plans/complete/hosts-tab.md`. No earlier plans are required.

## Implementation

Use the plugin API's `isRecord` from `../api.js` in a pure `src/plugins/hosts/hosts-values.ts`. Follow `src/plugins/roles/roles-file.ts:133` (`decodeRoles`) for top-level object narrowing. Define `SavedHost` with the saved spelling of `name`, the bare `host`, and optional `user`, numeric `port`, and `path`. Require name and destination. Treat omitted or whitespace-only optional strings as absent and reject explicit non-string values, including null. Apply the field rules to the whole value for every other string.

Accept names, users, and hosts made from ASCII letters, digits, dots, hyphens, and underscores. Add slash and tilde to the path alphabet. Keep one character class per whole-field predicate, using `DESTINATION_PATTERN` and `PATH_PATTERN` in `src/remote/address.ts:14` as the reference. The concrete plugin import rule in `eslint.plugin-boundaries.mjs:32` keeps the address parser out of the production imports.

The validator takes name, user, destination and path separately. Split destination at the first colon, require a non-empty bare host and, when there is a colon, require a non-empty port composed only of digits and representing an integer from 1 to 65535. A second colon fails port validation. The separate user field owns the optional SSH user. Export the name predicate, field validator, `host[:port]` formatter and case-insensitive name equality for later consumers.

The field validator reports `Invalid <field> "<value>". Use letters, digits, and . - _ only.` for the name, user and destination host. For path use `Invalid path "<value>". Use letters, digits, and . - _ / ~ only.` For port use `Invalid port "<value>". Use digits only, from 1 to 65535.` The decoder uses the same validator, rejects an entire non-object catalog, non-object entry, missing destination, invalid field or duplicate folded key, and otherwise returns all rows sorted by folded name. Treat `{}` as a valid empty catalog. Iterate own entries so a valid name such as `__proto__` is handled like any other saved name.

## Tests and verification

In `src/plugins/hosts/hosts-values.test.ts`, cover optional fields, display spelling and order, port bounds, blank and non-digit ports, bad characters and types, missing destination, invalid shapes, empty input object, special name keys and folded collisions. Run a corpus of accepted and rejected host, user and path characters against `parseRemoteAddress` from a test, comparing components apart from the parser's separators and the hosts-only port. Run `$janissary/scripts/run.mjs check-diff`. Exercise the decoder with a scratch object containing mixed-case names, a port, and a path.

## Out of scope

File I/O, command routing and UI.
