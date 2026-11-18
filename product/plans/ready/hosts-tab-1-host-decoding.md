# Validate saved host records

**Complexity: 4/10** — ~100 added lines, 6 requirements and 12 scenarios (p=4.94)

## Goal

Work unit 1 of [Hosts Tab](../complete/hosts-tab.md). This is the first work unit.

## Implementation

- **Host configuration fields (feature text).** `name` (a label for the host), `user` (the user name on the remote host), `destination` (`hostname` with an optional `:port`), and `path` (optional; the working directory on the remote machine, `cd`ed into after login).
- **Unique names (feature text).** A host name must be unique across all configurations.

- **File shape (user decision).** A JSON object keyed by host name, each value `{ "user"?, "destination", "path"? }`, matching `roles.json` and `commands.json`. Names are compared case-insensitively, so two keys differing only in case are a duplicate. `hosts list` prints the decoded hosts in this same shape.
- **Optional user (user decision).** Only `name` and `destination` are required. A blank `user` means ssh's own default (the local account, or a `User` line in `~/.ssh/config`), exactly as `ssh host` behaves today.
- **Name characters (user decision).** A host name is letters, digits, `.`, `-`, and `_` — the `on` address destination set minus `@` and `:`, so a name can never look like an address. `user`, the destination's host, and `path` are validated with the existing `on` address character sets in `src/remote/address.ts`; a port is digits only.
- **Malformed file (user decision).** Any problem with a hosts file — invalid JSON, a top level that is not an object, a malformed entry, or a case-insensitive duplicate name — makes that whole file unusable; no entry from it is used. Janissary never rewrites the file to repair it.

- **Plugin-owned hosts file module (user decision).** The read/decode/write module lives in the plugin and core imports it, the precedent `src/acp/ask-role.ts` set by importing `src/plugins/roles/roles-file.ts`. No new topic or capability.

Place the pure decoder and field validation in `src/plugins/hosts/hosts-file.ts`. Follow the data-module import in `src/acp/ask-role.ts:2` (`readRolesFile`). Use the object checks from `src/plugins/roles/roles-file.ts` (`decodeRoles`) while treating any malformed host entry as a catalog-wide error.

- A `SavedHost` type `{ name, user?, host, port?, path? }` and a pure decoder from parsed JSON to either a name-sorted list of saved hosts or a one-line problem. It rejects a non-object top level, a non-object entry, a missing or empty destination, a name or field outside its character set, a port that is not an integer from 1 to 65535, and case-insensitive duplicate names. Use `isRecord` from `../api.js` for the object checks, as `roles-file.ts` does.
- The character sets: the plugin boundary lint (`eslint.plugin-boundaries.mjs`, first block) forbids a server plugin from importing `src/remote/address.ts`, so this module declares its own patterns — name `[\w.-]`, user and host the `DESTINATION_PATTERN` set without `@`, path the `PATH_PATTERN` set — each a single character class under one quantifier (`security/detect-unsafe-regex`). Parity with `src/remote/address.ts` is pinned by a test in `src/plugins/hosts/hosts-file.test.ts` that runs a shared corpus of accepted and rejected strings through both (tests are exempt from the boundary rule), so a saved host can never resolve to an address `parseRemoteAddress` would reject.
- Expose one pure field validator for the decoder, modal save intent and `hosts add`. Accept missing or empty optional strings and omit those values from the decoded host. Reject present optional values of any other type. The stored destination contains only host and optional port, since the user has its own field. Validate the entire field, including control characters at its edges. Require a nonempty all-digit port string before checking the numeric range, so signs, decimals, and whitespace fail validation.
- Return `Invalid <field> "<value>". Use letters, digits, and . - _ only.` for invalid name, user or host characters. The path error lists `/ ~` as additional permitted characters and the port error explains the digits requirement and range. Return one deterministic problem for file validation so the next unit can use the problem text for notification deduplication.
- Sort by case-folded names and retain the original key spelling. Iterate own object entries and track case-folded names separately so names that coincide with JavaScript object properties remain ordinary host names.

## Tests

In `src/plugins/hosts/hosts-file.test.ts`, cover valid empty and populated catalogs, non-record top levels and entries, missing and empty destination, invalid character and optional field types, malformed and out-of-range ports, case-insensitive duplicates, deterministic ordering and remote-address character parity. Include ports 1 and 65535, line breaks at field boundaries, and an object-property name such as `constructor`.

## Out of scope

File selection and writes.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Run decoder fixtures with mixed case and one malformed entry.
